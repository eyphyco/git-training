import { describe, expect, it } from 'vitest';
import { fresh, text } from '../testing';

describe('git remote', () => {
  it('add / -v / remove', () => {
    const r = fresh(['git remote add origin https://github.com/you/app.git', 'git remote -v']);
    expect(text(r)).toBe('origin\thttps://github.com/you/app.git (fetch)\norigin\thttps://github.com/you/app.git (push)');
    expect(r.world.remotes.origin).toBeDefined();
    expect(fresh(['git remote add origin x', 'git remote add origin y']).ok).toBe(false);
    expect(text(fresh(['git remote add origin x', 'git remote remove origin', 'git remote']))).toBe('');
  });
});
