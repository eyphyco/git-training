import { describe, expect, it } from 'vitest';
import type { Setup } from '../world';
import { resolveRev } from '../model/refs';
import { repoWith, text } from '../testing';

const setup: Setup = {
  commits: [
    { id: 'c1', msg: 'init', files: { 'a.txt': 'a\n' } },
    { id: 'c2', parent: 'c1', msg: 'second', files: { 'a.txt': 'b\n' } },
  ],
  branches: { main: 'c2' },
};

describe('git tag', () => {
  it('軽量タグは今のコミットを直接指す', () => {
    const r = repoWith(setup, ['git tag v0.1 HEAD~1']);
    expect(r.world.local.refs.tags['v0.1']).toBe(r.aliases.c1);
    expect(r.events).toContainEqual({ type: 'TAG_CREATED', name: 'v0.1', oid: r.aliases.c1, annotated: false });
  });
  it('注釈付きタグはタグオブジェクトを作り、名前からコミットに解決できる', () => {
    const r = repoWith(setup, ['git tag -a v1.0 -m "release"']);
    const tagOid = r.world.local.refs.tags['v1.0'];
    expect(r.world.local.objects[tagOid]).toMatchObject({ type: 'tag', object: r.aliases.c2, tag: 'v1.0', message: 'release' });
    expect(resolveRev(r.world.local, 'v1.0')).toBe(r.aliases.c2);
  });
  it('一覧・パターン・削除', () => {
    const r = repoWith(setup, ['git tag v1.0', 'git tag v1.1', 'git tag v2.0', 'git tag -d v1.1']);
    expect(text(r)).toMatch(/^Deleted tag 'v1.1' \(was [0-9a-f]{7}\)$/);
    expect(text(repoWith(setup, ['git tag v1.0', 'git tag v2.0', 'git tag']))).toBe('v1.0\nv2.0');
    expect(text(repoWith(setup, ['git tag v1.0', 'git tag v2.0', 'git tag -l "v1*"']))).toBe('v1.0');
  });
  it('同名のタグはエラー、-a には -m が必要', () => {
    expect(text(repoWith(setup, ['git tag v1', 'git tag v1']))).toBe("fatal: tag 'v1' already exists");
    expect(repoWith(setup, ['git tag -a v1']).ok).toBe(false);
  });
});
