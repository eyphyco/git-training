import { describe, expect, it } from 'vitest';
import type { Setup } from '../world';
import { execute } from '../run';
import { getCommit } from '../model/objects';
import { repoWith, text } from '../testing';

const setup: Setup = {
  commits: [{ id: 'c1', msg: 'init', files: { 'a.txt': 'a\n', 'b.txt': 'b\n' } }],
  branches: { main: 'c1' },
  workingTree: { 'a.txt': 'a changed\n' },
  staged: { 'b.txt': 'b staged\n' },
};

describe('git stash', () => {
  it('変更を退避してワークツリーをきれいにする（実 Git と同じ形のコミットを作る）', () => {
    const r = repoWith(setup, ['git stash']);
    expect(text(r)).toMatch(/^Saved working directory and index state WIP on main: [0-9a-f]{7} init$/);
    expect(r.world.local.workingTree).toEqual({ 'a.txt': 'a\n', 'b.txt': 'b\n' });
    const w = getCommit(r.world.local, r.world.local.stash[0].oid);
    expect(w.parents[0]).toBe(r.aliases.c1);
    expect(getCommit(r.world.local, w.parents[1]).message).toMatch(/^index on main: [0-9a-f]{7} init$/);
    expect(text(execute(r.world, 'git stash list'))).toMatch(/^stash@\{0\}: WIP on main: [0-9a-f]{7} init$/);
  });
  it('pop で戻して stash を消す（ステージの変更はワークツリーの変更として戻る）', () => {
    const r = repoWith(setup, ['git stash', 'git stash pop']);
    expect(r.world.local.workingTree).toEqual({ 'a.txt': 'a changed\n', 'b.txt': 'b staged\n' });
    expect(r.world.local.stash).toHaveLength(0);
    expect(text(r)).toMatch(/Dropped refs\/stash@\{0\} \([0-9a-f]{40}\)$/);
    expect(text(execute(r.world, 'git status -s'))).toBe(' M a.txt\n M b.txt');
  });
  it('-m でメッセージ、apply は残す、drop / clear', () => {
    const r = repoWith(setup, ['git stash push -m "途中の作業"', 'git stash apply']);
    expect(r.world.local.stash).toHaveLength(1);
    expect(r.world.local.stash[0].message).toBe('On main: 途中の作業');
    expect(repoWith(setup, ['git stash', 'git stash drop']).world.local.stash).toHaveLength(0);
    expect(repoWith(setup, ['git stash', 'git stash clear']).world.local.stash).toHaveLength(0);
  });
  it('未追跡ファイルは -u のときだけ退避する', () => {
    const s: Setup = { ...setup, workingTree: { 'a.txt': 'a changed\n', 'new.txt': 'new\n' } };
    expect(repoWith(s, ['git stash']).world.local.workingTree['new.txt']).toBe('new\n');
    const u = repoWith(s, ['git stash -u']);
    expect(u.world.local.workingTree['new.txt']).toBeUndefined();
    expect(execute(u.world, 'git stash pop').world.local.workingTree['new.txt']).toBe('new\n');
  });
  it('変更がなければ何もしない。空の stash の pop はエラー', () => {
    expect(text(repoWith({ commits: setup.commits, branches: setup.branches }, ['git stash']))).toBe('No local changes to save');
    expect(text(repoWith({ commits: setup.commits, branches: setup.branches }, ['git stash pop']))).toBe('No stash entries found.');
  });
  it('別のブランチで pop して衝突したら stash は残す', () => {
    const s: Setup = {
      commits: [
        { id: 'c1', msg: 'init', files: { 'a.txt': 'a\n' } },
        { id: 'c2', parent: 'c1', msg: 'other', files: { 'a.txt': 'other\n' } },
      ],
      branches: { main: 'c1', other: 'c2' },
      workingTree: { 'a.txt': 'mine\n' },
    };
    const r = repoWith(s, ['git stash', 'git switch other', 'git stash pop']);
    expect(text(r)).toContain('CONFLICT (content): Merge conflict in a.txt');
    expect(text(r)).toContain('The stash entry is kept in case you need it again.');
    expect(r.world.local.stash).toHaveLength(1);
  });
  it('show で中身の要約を見られる', () => {
    expect(text(repoWith(setup, ['git stash', 'git stash show']))).toBe(' a.txt | 2 +-\n b.txt | 2 +-\n 2 files changed, 2 insertions(+), 2 deletions(-)');
  });
});
