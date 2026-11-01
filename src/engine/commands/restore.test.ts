import { describe, expect, it } from 'vitest';
import { repoWith } from '../testing';

const setup = { commits: [{ id: 'c1', msg: 'init', files: { 'a.txt': 'a\n', 'b.txt': 'b\n' } }], branches: { main: 'c1' } };

describe('git restore', () => {
  it('ワークツリーの変更を取り消す', () => {
    const r = repoWith({ ...setup, workingTree: { 'a.txt': 'broken\n' } }, ['git restore a.txt']);
    expect(r.world.local.workingTree['a.txt']).toBe('a\n');
    expect(r.events).toEqual([{ type: 'FILE_RESTORED', path: 'a.txt' }]);
  });
  it('--staged はステージだけ戻し、ワークツリーは残す', () => {
    const r = repoWith({ ...setup, staged: { 'b.txt': 'B\n' } }, ['git restore --staged b.txt']);
    expect(r.world.local.workingTree['b.txt']).toBe('B\n');
    expect(r.world.local.index['b.txt']).toBe(repoWith(setup).world.local.index['b.txt']);
  });
  it('消したファイルを戻せる・未追跡はエラー', () => {
    expect(repoWith({ ...setup, workingTree: { 'a.txt': null } }, ['git restore a.txt']).world.local.workingTree['a.txt']).toBe('a\n');
    expect(repoWith({ ...setup, workingTree: { 'n.txt': 'n' } }, ['git restore n.txt']).ok).toBe(false);
  });
});
