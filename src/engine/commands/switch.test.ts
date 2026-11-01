import { describe, expect, it } from 'vitest';
import { execute } from '../run';
import { repoWith, text } from '../testing';

const setup = {
  commits: [
    { id: 'c1', msg: 'init', files: { a: '1\n' } },
    { id: 'c2', parent: 'c1', msg: 'login', files: { 'login.ts': 'x\n' } },
  ],
  branches: { main: 'c1', feature: 'c2' },
};

describe('git switch', () => {
  it('ブランチを移動するとワークツリーが入れ替わる', () => {
    const r = repoWith(setup, ['git switch feature']);
    expect(text(r)).toBe("Switched to branch 'feature'");
    expect(r.world.local.workingTree['login.ts']).toBe('x\n');
    const back = execute(r.world, 'git switch main');
    expect(back.world.local.workingTree['login.ts']).toBeUndefined();
  });
  it('-c で作って移動、関係ない未コミット変更は持ち越す', () => {
    const r = repoWith({ ...setup, workingTree: { a: 'changed\n' } }, ['git switch -c topic']);
    expect(r.world.local.head).toEqual({ type: 'symbolic', ref: 'topic' });
    expect(r.world.local.workingTree.a).toBe('changed\n');
  });
  it('上書きされる変更があると中断', () => {
    const r = repoWith({ ...setup, workingTree: { 'login.ts': 'mine\n' } }, ['git switch feature']);
    expect(r.ok).toBe(false);
    expect(text(r)).toContain('untracked working tree files would be overwritten by checkout');
  });
  it('--detach とコミット指定のエラー', () => {
    const r = repoWith(setup, ['git switch --detach feature']);
    expect(r.world.local.head).toEqual({ type: 'detached', oid: r.aliases.c2 });
    expect(text(repoWith(setup, [`git switch HEAD~0`]))).toContain('a branch is expected');
    expect(text(repoWith(setup, ['git switch main']))).toBe("Already on 'main'");
    expect(repoWith(setup, ['git switch nope']).ok).toBe(false);
  });
});
