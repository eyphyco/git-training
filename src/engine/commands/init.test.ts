import { describe, expect, it } from 'vitest';
import { execute } from '../run';
import { createWorld } from '../world';
import { text } from '../testing';

describe('git init', () => {
  it('リポジトリ外では他の git コマンドが失敗し、init 後は使える', () => {
    const { world } = createWorld({ initialized: false, workingTree: { 'README.md': '# app\n' } });
    expect(execute(world, 'git status').ok).toBe(false);
    const r = execute(world, 'git init');
    expect(text(r)).toBe('Initialized empty Git repository in /home/you/project/.git/');
    expect(r.events).toEqual([{ type: 'REPO_INITIALIZED' }]);
    expect(execute(r.world, 'git status').ok).toBe(true);
    expect(text(execute(r.world, 'git init'))).toMatch(/^Reinitialized/);
  });
  it('-b で最初のブランチ名を指定できる', () => {
    const { world } = createWorld({ initialized: false });
    expect(execute(world, 'git init -b trunk').world.local.head).toEqual({ type: 'symbolic', ref: 'trunk' });
  });
});
