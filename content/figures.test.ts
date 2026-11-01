import { describe, expect, it } from 'vitest';
import { lessons } from '../src/lesson/content';
import { buildFrames, figures, splitFigures } from '../src/lesson/figures';

describe('動く図解', () => {
  it.each(Object.keys(figures))('%s の手順がすべて実行できる', (id) => {
    const frames = buildFrames(figures[id]);
    expect(frames.length).toBe(figures[id].steps.length + 1);
  });
  it('解説から呼んでいる図がすべて存在する', () => {
    for (const l of Object.values(lessons))
      for (const part of splitFigures(l.body ?? '')) if (part.kind === 'figure') expect(figures, `${l.id}: ${part.id}`).toHaveProperty(part.id);
  });
  it('splitFigures', () => {
    expect(splitFigures('a\n:::figure{id="x"}\nb')).toEqual([{ kind: 'md', text: 'a' }, { kind: 'figure', id: 'x' }, { kind: 'md', text: 'b' }]);
  });
});
