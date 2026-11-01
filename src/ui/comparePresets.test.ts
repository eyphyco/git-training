import { describe, expect, it } from 'vitest';
import { execute } from '../engine/run';
import { createWorld } from '../engine/world';
import { applyHostingEvent } from '../hosting/events';
import { PROGRAMS } from '../lesson/session';
import { PRESETS } from './comparePresets';

describe('比較ビューの題材', () => {
  it.each(PRESETS.map((p) => [p.id, p] as const))('%s：左右の手順がそのまま動く', (_, p) => {
    for (const side of [p.left, p.right]) {
      let w = createWorld(p.setup).world;
      for (const e of p.events ?? []) w = applyHostingEvent(w, e).world;
      side.steps.forEach((line, i) => {
        const r = execute(w, line, { programs: PROGRAMS });
        // revert と reset の比較の右側は、push が拒否されるのを見せる
        const expectFail = p.id === 'revert-reset' && side === p.right && i === side.steps.length - 1;
        expect(r.ok, `${p.id} ${line}\n${r.output.map((o) => o.text).join('\n')}`).toBe(!expectFail);
        w = r.world;
      });
    }
  });
});
