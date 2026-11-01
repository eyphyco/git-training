import { describe, expect, it } from 'vitest';
import type { Setup } from '../world';
import { fresh, repoWith, text } from '../testing';

const setup: Setup = {
  commits: [
    { id: 'c1', msg: 'init', files: { a: '1\n' } },
    { id: 'c2', parent: 'c1', msg: 'x', files: { b: '1\n' } },
  ],
  branches: { main: 'c1', feature: 'c2' },
};

describe('git branch', () => {
  it('作成と一覧', () => {
    const r = repoWith(setup, ['git branch topic', 'git branch']);
    expect(text(r)).toBe('  feature\n* main\n  topic');
    expect(r.world.local.refs.heads.topic).toBe(r.aliases.c1);
    expect(r.world.local.head).toEqual({ type: 'symbolic', ref: 'main' });
  });
  it('起点を指定して作成、重複はエラー', () => {
    const r = repoWith(setup, ['git branch t2 feature']);
    expect(r.world.local.refs.heads.t2).toBe(r.aliases.c2);
    expect(repoWith(setup, ['git branch main']).ok).toBe(false);
  });
  it('-d は未マージだと拒否、-D で強制', () => {
    expect(text(repoWith(setup, ['git branch -d feature']))).toContain('is not fully merged');
    expect(repoWith(setup, ['git branch -D feature']).world.local.refs.heads.feature).toBeUndefined();
    expect(repoWith(setup, ['git branch -d main']).ok).toBe(false);
  });
  it('-m で名前変更', () => {
    const r = repoWith(setup, ['git branch -m trunk']);
    expect(r.world.local.head).toEqual({ type: 'symbolic', ref: 'trunk' });
    expect(r.world.local.refs.heads.main).toBeUndefined();
  });
  it('コミット前は作れない', () => {
    expect(fresh(['git branch x']).ok).toBe(false);
  });
});
