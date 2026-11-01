import { describe, expect, it } from 'vitest';
import { repoWith } from '../engine/testing';
import { complete } from './completion';

const { world } = repoWith({ commits: [{ id: 'c1', msg: 'i', files: { 'README.md': '#\n', 'src/app.ts': '' } }], branches: { main: 'c1', 'feature/login': 'c1', 'feature/cart': 'c1' } });
const repo = world.local;

describe('complete', () => {
  it('サブコマンドとブランチ名とファイル名', () => {
    expect(complete('git sw', repo).value).toBe('git switch ');
    expect(complete('git switch fe', repo)).toEqual({ value: 'git switch feature/', candidates: ['feature/cart', 'feature/login'] });
    expect(complete('git add RE', repo).value).toBe('git add README.md ');
    expect(complete('git commit --am', repo).value).toBe('git commit --amend ');
    expect(complete('ca', repo).value).toBe('cat ');
  });
});
