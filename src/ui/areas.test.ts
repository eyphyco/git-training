import { describe, expect, it } from 'vitest';
import { repoWith } from '../engine/testing';
import { computeAreas, motionFor } from './areas';

describe('computeAreas', () => {
  it('ワークツリー・ステージ・HEAD の状態を分ける', () => {
    const r = repoWith(
      {
        commits: [{ id: 'c1', msg: 'i', files: { 'a.txt': 'a\n', 'b.txt': 'b\n', 'd.txt': 'd\n' } }],
        branches: { main: 'c1' },
        staged: { 'b.txt': 'B\n', 'n.txt': 'n\n' },
        workingTree: { 'a.txt': 'A\n', 'u.txt': 'u', 'd.txt': null },
      },
      [],
    );
    const a = computeAreas(r.world.local);
    const st = (list: typeof a.worktree) => Object.fromEntries(list.map((f) => [f.path, f.state]));
    expect(st(a.worktree)).toEqual({ 'a.txt': 'modified', 'b.txt': 'clean', 'd.txt': 'deleted', 'n.txt': 'clean', 'u.txt': 'untracked' });
    expect(st(a.index)).toEqual({ 'a.txt': 'clean', 'b.txt': 'staged', 'd.txt': 'clean', 'n.txt': 'added' });
    expect(a.head.map((f) => f.path)).toEqual(['a.txt', 'b.txt', 'd.txt']);
  });
  it('add はステージ列へ左から入ってくる', () => {
    expect(motionFor([{ type: 'FILE_STAGED', path: 'a', change: 'added' }], 'index', 'a', new Set())).toBe('from-left');
    expect(motionFor([{ type: 'FILE_STAGED', path: 'a', change: 'added' }], 'worktree', 'a', new Set())).toBe(null);
  });
});
