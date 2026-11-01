import { describe, expect, it } from 'vitest';
import type { Setup } from '../world';
import { execute } from '../run';
import { getCommit } from '../model/objects';
import { repoWith, text } from '../testing';

const setup: Setup = {
  commits: [
    { id: 'c1', msg: 'init', files: { 'a.txt': 'a\n' } },
    { id: 'c2', parent: 'c1', msg: 'main work', files: { 'm.txt': 'm\n' } },
    { id: 'f1', parent: 'c1', msg: 'fix typo', files: { 'a.txt': 'A\n' } },
    { id: 'f2', parent: 'f1', msg: 'feature', files: { 'f.txt': 'f\n' } },
  ],
  branches: { main: 'c2', feature: 'f2' },
};

describe('git cherry-pick', () => {
  it('指定したコミットの変更だけを今のブランチにコピーする', () => {
    const r = repoWith(setup, ['git cherry-pick feature~1']);
    expect(r.ok).toBe(true);
    const head = getCommit(r.world.local, r.world.local.refs.heads.main);
    const orig = getCommit(r.world.local, r.aliases.f1);
    expect(head.parents).toEqual([r.aliases.c2]);
    expect(head.message).toBe('fix typo');
    expect(head.author).toEqual(orig.author);
    expect(head.committer.time).toBeGreaterThan(orig.committer.time);
    expect(r.world.local.workingTree).toEqual({ 'a.txt': 'A\n', 'm.txt': 'm\n' });
    expect(text(r)).toMatch(/^\[main [0-9a-f]{7}\] fix typo\n Date: .+\n 1 file changed, 1 insertion\(\+\), 1 deletion\(-\)$/);
  });
  it('複数指定すると順に当てる', () => {
    const r = repoWith(setup, [`git cherry-pick feature~1 feature`]);
    const head = getCommit(r.world.local, r.world.local.refs.heads.main);
    expect(head.message).toBe('feature');
    expect(getCommit(r.world.local, head.parents[0]).message).toBe('fix typo');
  });
  it('衝突 → 解消 → --continue、--skip、--abort', () => {
    const s: Setup = { ...setup, commits: [...setup.commits!, { id: 'c3', parent: 'c2', msg: 'main a', files: { 'a.txt': 'main\n' } }], branches: { main: 'c3', feature: 'f2' } };
    const r = repoWith(s, ['git cherry-pick feature~1']);
    expect(r.ok).toBe(true);
    expect(text(r)).toContain('CONFLICT (content): Merge conflict in a.txt');
    expect(r.world.local.workingTree['a.txt']).toMatch(/^<<<<<<< HEAD\nmain\n=======\nA\n>>>>>>> [0-9a-f]{7} \(fix typo\)\n$/);
    expect(text(execute(r.world, 'git status'))).toContain('You are currently cherry-picking commit');
    const w = execute(execute(r.world, 'echo A > a.txt').world, 'git add a.txt').world;
    const done = execute(w, 'git cherry-pick --continue');
    expect(done.world.local.inProgress).toBeUndefined();
    expect(getCommit(done.world.local, done.world.local.refs.heads.main).message).toBe('fix typo');
    const skipped = execute(r.world, 'git cherry-pick --skip');
    expect(skipped.world.local.inProgress).toBeUndefined();
    expect(skipped.world.local.refs.heads.main).toBe(r.aliases.c3);
    expect(skipped.world.local.workingTree['a.txt']).toBe('main\n');
    const aborted = execute(r.world, 'git cherry-pick --abort');
    expect(aborted.world.local.workingTree['a.txt']).toBe('main\n');
  });
  it('衝突解消後は git commit でも完了できる', () => {
    const s: Setup = { ...setup, commits: [...setup.commits!, { id: 'c3', parent: 'c2', msg: 'main a', files: { 'a.txt': 'main\n' } }], branches: { main: 'c3', feature: 'f2' } };
    const r = repoWith(s, ['git cherry-pick feature~1', 'echo A > a.txt', 'git add a.txt', 'git commit']);
    expect(r.ok).toBe(true);
    expect(r.world.local.inProgress).toBeUndefined();
    expect(getCommit(r.world.local, r.world.local.refs.heads.main).message).toBe('fix typo');
  });
  it('途中でないのに --continue はエラー', () => {
    expect(text(repoWith(setup, ['git cherry-pick --continue']))).toContain('no cherry-pick in progress');
  });
});
