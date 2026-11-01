import { describe, expect, it } from 'vitest';
import { execute } from '../run';
import { teammatePush } from '../remote';
import { repoWith, text } from '../testing';

const setup = { commits: [{ id: 'c1', msg: 'init', files: { a: '1\n' } }], branches: { main: 'c1' }, remotes: { origin: { branches: { main: 'c1' } } } };

describe('git fetch', () => {
  it('同僚の push を取得して origin/main だけが進む', () => {
    const r = repoWith(setup);
    const t = teammatePush(r.world, { author: 'Sato', message: 'update', files: { a: '2\n' } });
    expect(text(execute(t.world, 'git status'))).toContain("Your branch is up to date with 'origin/main'.");
    const f = execute(t.world, 'git fetch');
    expect(text(f)).toMatch(/^From https:\/\/github.com\/you\/project\n {3}[0-9a-f]{7}\.\.[0-9a-f]{7}  main {7}-> origin\/main$/);
    expect(f.world.local.refs.remotes.origin.main).toBe(t.oid);
    expect(f.world.local.refs.heads.main).toBe(r.aliases.c1);
    expect(text(execute(f.world, 'git status'))).toContain("Your branch is behind 'origin/main' by 1 commit, and can be fast-forwarded.");
    expect(text(execute(f.world, 'git branch -vv'))).toMatch(/\[origin\/main: behind 1\]/);
  });
  it('fetch 前はリモートだけのコミットを手元に持っていない', () => {
    const r = repoWith(setup);
    const t = teammatePush(r.world, { author: 'Sato', message: 'update', files: { a: '2\n' } });
    expect(t.world.local.objects[t.oid]).toBeUndefined();
  });
});
