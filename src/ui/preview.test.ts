import { describe, expect, it } from 'vitest';
import { createWorld } from '../engine/world';
import { previewOf } from './preview';

const { world, aliases } = createWorld({
  commits: [
    { id: 'c1', msg: 'init', files: { 'a.txt': 'a\n' } },
    { id: 'c2', parent: 'c1', msg: 'two', files: { 'a.txt': 'b\n' } },
  ],
  branches: { main: 'c2' },
});

describe('previewOf', () => {
  it('reset などは実行後の World を返す（元の World は変えない）', () => {
    const p = previewOf(world, 'git reset --hard HEAD~1');
    expect(p?.local.refs.heads.main).toBe(aliases.c1);
    expect(world.local.refs.heads.main).toBe(aliases.c2);
  });
  it('予告しないコマンド・失敗するコマンド・rebase -i は null', () => {
    expect(previewOf(world, 'git status')).toBeNull();
    expect(previewOf(world, 'git reset --hard nope')).toBeNull();
    expect(previewOf(world, 'git rebase -i HEAD~1')).toBeNull();
    expect(previewOf(world, 'git commit --amend -m x')).not.toBeNull();
  });
});
