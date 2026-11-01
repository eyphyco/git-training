import { describe, expect, it } from 'vitest';
import { sha1 } from './sha1';
import { hashBlob, readTree, writeTree } from './objects';
import { emptyRepo } from '../world';

describe('sha1', () => {
  it('既知のベクタと一致する', () => {
    const enc = new TextEncoder();
    expect(sha1(enc.encode(''))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(sha1(enc.encode('abc'))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha1(enc.encode('a'.repeat(1000)))).toBe('291e9a6c66994949b57ba5e650361e98fc36b1ba');
  });
});

describe('objects', () => {
  it('blob は実 Git と同じ ID になる（git hash-object）', () => {
    expect(hashBlob('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    expect(hashBlob('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
    expect(hashBlob('日本語\n')).toBe(hashBlob('日本語\n'));
  });

  it('入れ子の tree を書いて読み戻せる', () => {
    const repo = emptyRepo();
    const files = { 'a.txt': hashBlob('a'), 'src/b.ts': hashBlob('b'), 'src/lib/c.ts': hashBlob('c') };
    const tree = writeTree(repo, files);
    expect(readTree(repo, tree)).toEqual(files);
  });
});
