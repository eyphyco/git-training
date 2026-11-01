import { describe, expect, it } from 'vitest';
import { lessons } from '../lesson/content';
import { commandInfo } from './glossary';
import { relatedLessons, searchCommands } from './commandIndex';

describe('コマンド辞典', () => {
  it('模範解答から関連レッスンを集める', () => {
    const ids = relatedLessons('git push', Object.values(lessons)).map((l) => l.id);
    expect(ids).toContain('ch04-02');
    expect(ids).not.toContain('ch01-02');
  });
  it('日本語でも検索できる', () => {
    const hits = searchCommands(Object.entries(commandInfo), 'ステージ').map(([k]) => k);
    expect(hits).toContain('git add');
    expect(hits).toContain('git restore --staged');
  });
});
