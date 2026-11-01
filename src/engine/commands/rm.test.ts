import { describe, expect, it } from 'vitest';
import { repoWith } from '../testing';

const base = { commits: [{ id: 'c1', msg: 'i', files: { 'a.txt': 'a\n' } }], branches: { main: 'c1' } };

describe('git rm', () => {
  it('インデックスとワークツリーから消す', () => {
    const r = repoWith(base, ['git rm a.txt']);
    expect(r.world.local.index).toEqual({});
    expect(r.world.local.workingTree).toEqual({});
  });
  it('--cached はワークツリーに残す', () => {
    const r = repoWith(base, ['git rm --cached a.txt']);
    expect(r.world.local.index).toEqual({});
    expect(r.world.local.workingTree).toEqual({ 'a.txt': 'a\n' });
  });
  it('変更があると -f なしでは消さない', () => {
    expect(repoWith({ ...base, workingTree: { 'a.txt': 'b\n' } }, ['git rm a.txt']).ok).toBe(false);
  });
});
