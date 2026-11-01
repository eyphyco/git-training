import { describe, expect, it } from 'vitest';
import { fresh, repoWith, text } from '../testing';

const base = { commits: [{ id: 'c1', msg: 'init', files: { 'a.txt': 'a\n', 'b.txt': 'b\n' } }], branches: { main: 'c1' } };

describe('git status', () => {
  it('コミット前は No commits yet と未追跡ファイル', () => {
    const r = fresh(['echo hi > a.txt', 'mkdir src', 'echo x > src/x.ts', 'git status']);
    expect(text(r)).toBe(
      ['On branch main', '', 'No commits yet', '', 'Untracked files:', '  (use "git add <file>..." to include in what will be committed)', '\ta.txt', '\tsrc/', '', 'nothing added to commit but untracked files present (use "git add" to track)'].join('\n'),
    );
  });
  it('ステージ済み・未ステージ・削除を分けて表示', () => {
    const r = repoWith({ ...base, staged: { 'c.txt': 'c\n' }, workingTree: { 'a.txt': 'A\n', 'b.txt': null } }, ['git status']);
    const t = text(r);
    expect(t).toContain('Changes to be committed:\n  (use "git restore --staged <file>..." to unstage)\n\tnew file:   c.txt');
    expect(t).toContain('\tmodified:   a.txt');
    expect(t).toContain('\tdeleted:    b.txt');
    expect(t).toContain('(use "git add/rm <file>..."');
  });
  it('クリーンな状態と -s', () => {
    expect(text(repoWith(base, ['git status']))).toBe('On branch main\nnothing to commit, working tree clean');
    expect(text(repoWith({ ...base, workingTree: { 'a.txt': 'A\n', 'n.txt': '' } }, ['git status -s']))).toBe(' M a.txt\n?? n.txt');
  });
  it('detached HEAD', () => {
    expect(text(repoWith({ ...base, head: 'detached:c1' }, ['git status']))).toMatch(/^HEAD detached at [0-9a-f]{7}/);
  });
});
