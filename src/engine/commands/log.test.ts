import { describe, expect, it } from 'vitest';
import { formatDate } from './log';
import { repoWith, text, fresh } from '../testing';

const setup = {
  commits: [
    { id: 'c1', msg: 'init', files: { a: '1\n' } },
    { id: 'c2', parent: 'c1', msg: 'second', files: { a: '2\n' } },
  ],
  branches: { main: 'c2', old: 'c1' },
};

describe('git log', () => {
  it('--oneline は新しい順で、ブランチを装飾する', () => {
    const t = text(repoWith(setup, ['git log --oneline']));
    expect(t).toMatch(/^[0-9a-f]{7} \(HEAD -> main\) second\n[0-9a-f]{7} \(old\) init$/);
  });
  it('標準形式と -n', () => {
    const t = text(repoWith(setup, ['git log -1']));
    expect(t).toMatch(/^commit [0-9a-f]{40} \(HEAD -> main\)\nAuthor: You <you@example.com>\nDate: {3}Thu Jan 1 09:02:00 2026 \+0900\n\n {4}second$/);
  });
  it('コミットがないとエラー', () => {
    expect(text(fresh(['git log']))).toBe("fatal: your current branch 'main' does not have any commits yet");
  });
  it('日付の形式', () => {
    expect(formatDate(1767225600, '+0900')).toBe('Thu Jan 1 09:00:00 2026 +0900');
  });
});
