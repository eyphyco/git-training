import { describe, expect, it } from 'vitest';
import { repoWith, text } from '../testing';

const setup = {
  commits: [
    { id: 'c1', msg: 'init', files: { a: '1\n' } },
    { id: 'c2', parent: 'c1', msg: 'two', files: { a: '2\n' } },
  ],
  branches: { main: 'c2' },
};

describe('git checkout', () => {
  it('-b でブランチを作って移動', () => {
    expect(repoWith(setup, ['git checkout -b topic']).world.local.head).toEqual({ type: 'symbolic', ref: 'topic' });
  });
  it('コミットを指定すると detached HEAD', () => {
    const r = repoWith(setup, ['git checkout HEAD~1']);
    expect(r.world.local.head).toEqual({ type: 'detached', oid: r.aliases.c1 });
    expect(text(r)).toContain("You are in 'detached HEAD' state.");
  });
  it('-- file でファイルを戻す', () => {
    expect(repoWith({ ...setup, workingTree: { a: 'x\n' } }, ['git checkout -- a']).world.local.workingTree.a).toBe('2\n');
  });
});
