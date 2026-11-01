import { describe, expect, it } from 'vitest';
import type { Setup } from '../world';
import { repoWith, text } from '../testing';

const setup: Setup = {
  commits: [
    { id: 'c1', msg: 'init', files: { 'a.txt': 'a\n' } },
    { id: 'c2', parent: 'c1', msg: 'second', files: { 'a.txt': 'b\n' } },
  ],
  branches: { main: 'c2' },
};

describe('git reflog', () => {
  it('HEAD の動きを新しい順に表示する', () => {
    const t = text(repoWith(setup, ['git reset --hard HEAD~1', 'git reflog']));
    expect(t).toMatch(/^[0-9a-f]{7} HEAD@\{0\}: reset: moving to HEAD~1\n[0-9a-f]{7} HEAD@\{1\}: commit: second\n[0-9a-f]{7} HEAD@\{2\}: commit \(initial\): init$/);
  });
  it('ブランチの reflog も見られる', () => {
    const t = text(repoWith(setup, ['git switch -c f', 'git reflog show main']));
    expect(t.split('\n')[0]).toMatch(/^[0-9a-f]{7} main@\{0\}: commit: second$/);
  });
  it('switch の移動も残る', () => {
    expect(text(repoWith(setup, ['git switch -c f', 'git reflog -n 1']))).toMatch(/HEAD@\{0\}: checkout: moving from main to f$/);
  });
});
