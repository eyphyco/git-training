import { describe, expect, it } from 'vitest';
import { execute } from '../run';
import { teammatePush } from '../remote';
import { fresh, repoWith, text } from '../testing';

const setup = { commits: [{ id: 'c1', msg: 'init', files: { a: '1\n' } }], branches: { main: 'c1' }, remotes: { origin: { branches: { main: 'c1' } } } };

describe('git push', () => {
  it('ローカルのコミットを送る', () => {
    const r = repoWith(setup, ['echo 2 > a', 'git commit -am two', 'git push']);
    expect(text(r)).toMatch(/To https:\/\/github.com\/you\/project.git\n {3}[0-9a-f]{7}\.\.[0-9a-f]{7}  main {7}-> main$/);
    expect(r.world.remotes.origin.refs.heads.main).toBe(r.world.local.refs.heads.main);
    expect(r.world.local.refs.remotes.origin.main).toBe(r.world.local.refs.heads.main);
  });
  it('空のリモートへ -u で最初の push', () => {
    const r = fresh(['touch a', 'git add a', 'git commit -m one', 'git remote add origin https://github.com/you/new.git', 'git push -u origin main']);
    expect(text(r)).toMatch(/ \* \[new branch\] {6}main {7}-> main\nbranch 'main' set up to track 'origin\/main'.$/);
    expect(fresh(['touch a', 'git add a', 'git commit -m one', 'git remote add origin u', 'git push']).ok).toBe(false);
  });
  it('他人が先に push していると rejected、pull してから push できる', () => {
    const base = repoWith(setup, ['echo mine > b', 'git add b', 'git commit -m mine']);
    const t = teammatePush(base.world, { author: 'Sato', message: 'theirs', files: { c: 'c\n' } });
    const rej = execute(t.world, 'git push');
    expect(rej.ok).toBe(false);
    expect(text(rej)).toContain(' ! [rejected]        main -> main (fetch first)');
    const pulled = execute(t.world, 'git pull');
    expect(pulled.ok).toBe(true);
    const pushed = execute(pulled.world, 'git push');
    expect(pushed.ok).toBe(true);
    expect(pushed.world.remotes.origin.refs.heads.main).toBe(pulled.world.local.refs.heads.main);
  });
  it('--force は上書きする', () => {
    const base = repoWith(setup, ['echo mine > b', 'git add b', 'git commit -m mine']);
    const t = teammatePush(base.world, { author: 'Sato', message: 'theirs', files: { c: 'c\n' } });
    const f = execute(t.world, 'git push --force');
    expect(text(f)).toContain('(forced update)');
    expect(f.world.remotes.origin.refs.heads.main).toBe(base.world.local.refs.heads.main);
  });
  it('--force-with-lease は、リモートが手元の記録（origin/main）と同じときだけ上書きする', () => {
    const base = repoWith(setup, ['echo mine > b', 'git add b', 'git commit -m mine']);
    const t = teammatePush(base.world, { author: 'Sato', message: 'theirs', files: { c: 'c\n' } });
    const stale = execute(t.world, 'git push --force-with-lease');
    expect(stale.ok).toBe(false);
    expect(text(stale)).toContain(' ! [rejected]        main -> main (stale info)');
    expect(stale.world.remotes.origin.refs.heads.main).toBe(t.world.remotes.origin.refs.heads.main);
    // fetch して記録を新しくすると通る（同僚のコミットは消える。だから fetch 後は log で確かめてから）
    const fetched = execute(t.world, 'git fetch');
    const ok = execute(fetched.world, 'git push --force-with-lease');
    expect(text(ok)).toContain('(forced update)');
    expect(ok.world.remotes.origin.refs.heads.main).toBe(base.world.local.refs.heads.main);
  });
  it('--delete でリモートブランチを消す', () => {
    const r = repoWith({ ...setup, remotes: { origin: { branches: { main: 'c1', old: 'c1' } } } }, ['git push origin --delete old']);
    expect(r.world.remotes.origin.refs.heads.old).toBeUndefined();
  });
});
