import { describe, expect, it } from 'vitest';
import type { Setup } from '../world';
import { execute } from '../run';
import { getCommit } from '../model/objects';
import { repoWith, text } from '../testing';

const base: Setup = {
  commits: [
    { id: 'c1', msg: 'init', files: { 'a.txt': 'one\ntwo\nthree\n' } },
    { id: 'c2', parent: 'c1', msg: 'bug', files: { 'a.txt': 'one\nBUG\nthree\n' } },
    { id: 'c3', parent: 'c2', msg: 'more', files: { 'b.txt': 'b\n' } },
  ],
  branches: { main: 'c3' },
};

describe('git revert', () => {
  it('打ち消すコミットを新しく作る（履歴は消えない）', () => {
    const r = repoWith(base, ['git revert HEAD~1']);
    expect(r.ok).toBe(true);
    const head = getCommit(r.world.local, r.world.local.refs.heads.main);
    expect(head.parents).toEqual([r.aliases.c3]);
    expect(head.message).toBe(`Revert "bug"\n\nThis reverts commit ${r.aliases.c2}.`);
    expect(r.world.local.workingTree['a.txt']).toBe('one\ntwo\nthree\n');
    expect(text(r)).toMatch(/^\[main [0-9a-f]{7}\] Revert "bug"\n 1 file changed, 1 insertion\(\+\), 1 deletion\(-\)$/);
  });
  it('衝突したら止まり、解消して --continue で完了', () => {
    const setup: Setup = { ...base, commits: [...base.commits!, { id: 'c4', parent: 'c3', msg: 'fix', files: { 'a.txt': 'one\nFIXED\nthree\n' } }], branches: { main: 'c4' } };
    const r = repoWith(setup, ['git revert HEAD~2']);
    expect(text(r)).toContain('error: could not revert');
    expect(r.world.local.inProgress?.op).toBe('revert');
    expect(r.world.local.workingTree['a.txt']).toContain('>>>>>>> parent of');
    let w = ['echo one > a.txt', 'echo two >> a.txt', 'echo three >> a.txt'].reduce((acc, l) => execute(acc, l).world, r.world);
    expect(execute(w, 'git revert --continue').ok).toBe(false);
    w = execute(w, 'git add a.txt').world;
    const done = execute(w, 'git revert --continue');
    expect(done.ok).toBe(true);
    expect(done.world.local.inProgress).toBeUndefined();
    expect(getCommit(done.world.local, done.world.local.refs.heads.main).message).toMatch(/^Revert "bug"/);
  });
  it('--abort で始める前に戻る', () => {
    const setup: Setup = { ...base, commits: [...base.commits!, { id: 'c4', parent: 'c3', msg: 'fix', files: { 'a.txt': 'one\nFIXED\nthree\n' } }], branches: { main: 'c4' } };
    const r = repoWith(setup, ['git revert HEAD~2', 'git revert --abort']);
    expect(r.world.local.inProgress).toBeUndefined();
    expect(r.world.local.workingTree['a.txt']).toBe('one\nFIXED\nthree\n');
    expect(r.world.local.refs.heads.main).toBe(r.aliases.c4);
  });
  it('マージコミットは未対応', () => {
    const r = repoWith(
      {
        commits: [
          { id: 'c1', msg: 'init', files: { 'a.txt': 'a\n' } },
          { id: 'c2', parent: 'c1', msg: 'f', files: { 'f.txt': 'f\n' } },
          { id: 'c3', parent: 'c1', msg: 'g', files: { 'g.txt': 'g\n' } },
          { id: 'm', parents: ['c2', 'c3'], msg: 'merge', files: { 'g.txt': 'g\n' } },
        ],
        branches: { main: 'm' },
      },
      ['git revert HEAD'],
    );
    expect(r.ok).toBe(false);
    expect(text(r)).toContain('is a merge but no -m option was given');
  });
});
