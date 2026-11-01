import { describe, expect, it } from 'vitest';
import { getCommit } from '../model/objects';
import { execute } from '../run';
import { teammatePush } from '../remote';
import { repoWith, text } from '../testing';

const setup = { commits: [{ id: 'c1', msg: 'init', files: { a: 'one\n' } }], branches: { main: 'c1' }, remotes: { origin: { branches: { main: 'c1' } } } };

describe('git pull', () => {
  it('fast-forward で取り込む', () => {
    const t = teammatePush(repoWith(setup).world, { author: 'Sato', message: 'u', files: { b: 'b\n' } });
    const r = execute(t.world, 'git pull');
    expect(text(r)).toContain('Fast-forward');
    expect(r.world.local.refs.heads.main).toBe(t.oid);
    expect(r.world.local.workingTree.b).toBe('b\n');
  });
  it('分岐していればマージコミット（メッセージに URL）', () => {
    const base = repoWith(setup, ['echo x > x', 'git add x', 'git commit -m mine']);
    const t = teammatePush(base.world, { author: 'Sato', message: 'u', files: { b: 'b\n' } });
    const r = execute(t.world, 'git pull');
    const c = getCommit(r.world.local, r.world.local.refs.heads.main);
    expect(c.message).toBe("Merge branch 'main' of https://github.com/you/project");
    expect(c.parents).toEqual([base.world.local.refs.heads.main, t.oid]);
  });
  it('同じ行を変えていればコンフリクト', () => {
    const base = repoWith(setup, ['echo mine > a', 'git commit -am mine']);
    const t = teammatePush(base.world, { author: 'Sato', message: 'u', files: { a: 'theirs\n' } });
    const r = execute(t.world, 'git pull');
    expect(text(r)).toContain('CONFLICT (content): Merge conflict in a');
    expect(r.world.local.inProgress?.conflicts).toEqual(['a']);
  });
  it('追跡先がなければエラー、--rebase は未対応', () => {
    expect(repoWith(setup, ['git switch -c topic', 'git pull']).ok).toBe(false);
    expect(repoWith(setup, ['git pull --rebase']).ok).toBe(false);
  });
});
