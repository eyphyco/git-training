import { describe, expect, it } from 'vitest';
import { dailySeries, goalInfo, hintStats } from './dashboard';

describe('dashboard', () => {
  it('直近の日別学習時間（月またぎ）', () => {
    const s = dailySeries({ '2026-10-31': 30, '2026-11-01': 45 }, '2026-11-01', 3);
    expect(s).toEqual([
      { day: '2026-10-30', label: '10/30', minutes: 0 },
      { day: '2026-10-31', label: '10/31', minutes: 30 },
      { day: '2026-11-01', label: '11/1', minutes: 45 },
    ]);
  });
  it('ヒント使用率', () => {
    expect(hintStats({ a: { status: 'done', hintsUsed: 2 }, b: { status: 'done', hintsUsed: 0 }, c: { status: 'doing', hintsUsed: 1 } })).toEqual({ done: 2, withHints: 1, rate: 0.5, total: 3 });
  });
  it('ゴール日の既定は最初の学習日から30日後', () => {
    expect(goalInfo(undefined, { '2026-11-01': 10 }, '2026-11-11')).toEqual({ goal: '2026-12-01', daysLeft: 20 });
    expect(goalInfo('2026-11-05', {}, '2026-11-11').daysLeft).toBe(-6);
  });
});
