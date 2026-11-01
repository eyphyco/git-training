import { describe, expect, it } from 'vitest';
import { fresh, text } from '../testing';

describe('git config', () => {
  it('user.name / user.email を設定・取得できる', () => {
    const r = fresh(['git config --global user.name "Phyco"', 'git config user.name']);
    expect(text(r)).toBe('Phyco');
    expect(r.world.local.config.user.name).toBe('Phyco');
    expect(fresh(['git config core.editor vim']).ok).toBe(false);
  });
});
