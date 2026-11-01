// 学習ダッシュボード（F-23）の集計。日付は "YYYY-MM-DD"（端末のローカル日付）。
import type { Progress } from '../store/progress';

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
}

function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** 直近 days 日分の学習分数（古い順） */
export function dailySeries(log: Progress['studyLog'], today: string, days = 14): { day: string; label: string; minutes: number }[] {
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - days + 1);
    return { day, label: `${Number(day.slice(5, 7))}/${Number(day.slice(8))}`, minutes: log[day] ?? 0 };
  });
}

/** 完了したレッスンのうち、ヒントを使ったものの割合 */
export function hintStats(lessons: Progress['lessons']): { done: number; withHints: number; rate: number; total: number } {
  const done = Object.values(lessons).filter((l) => l.status === 'done');
  const withHints = done.filter((l) => l.hintsUsed > 0).length;
  return { done: done.length, withHints, rate: done.length ? withHints / done.length : 0, total: Object.values(lessons).reduce((a, l) => a + l.hintsUsed, 0) };
}

/** ゴール日：設定がなければ最初に学習した日（なければ今日）の30日後 */
export function goalInfo(goalDate: string | undefined, log: Progress['studyLog'], today: string): { goal: string; daysLeft: number } {
  const first = Object.keys(log).sort()[0] ?? today;
  const goal = goalDate ?? addDays(first, 30);
  return { goal, daysLeft: diffDays(today, goal) };
}
