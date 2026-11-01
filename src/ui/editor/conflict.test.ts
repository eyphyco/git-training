import { describe, expect, it } from 'vitest';
import { hasConflict, resolveConflicts } from './conflict';

const text = 'top\n<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> feature\nmid\n<<<<<<< HEAD\nA\n=======\nB\n>>>>>>> feature\n';

describe('resolveConflicts', () => {
  it('各ブロックを片方・両方で置き換える', () => {
    expect(hasConflict(text)).toBe(true);
    expect(resolveConflicts(text, 'ours')).toBe('top\nmine\nmid\nA\n');
    expect(resolveConflicts(text, 'theirs')).toBe('top\ntheirs\nmid\nB\n');
    expect(resolveConflicts(text, 'both')).toBe('top\nmine\ntheirs\nmid\nA\nB\n');
    expect(hasConflict(resolveConflicts(text, 'both'))).toBe(false);
  });
});
