// コマンド辞典の関連レッスン：各レッスンの模範解答から、そのコマンドを使うレッスンを自動で集める。
import { commandMatches } from '../lesson/checks';
import type { Lesson } from '../lesson/types';

export function relatedLessons(command: string, all: Lesson[]): Lesson[] {
  return all.filter((l) => l.steps.some((s) => (!s.type || s.type === 'task') && 'answer' in s && s.answer?.some((a) => commandMatches(a, command))));
}

export function searchCommands<T extends { summary: string; detail?: string }>(entries: [string, T][], q: string): [string, T][] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return entries;
  return entries.filter(([k, v]) => words.every((w) => `${k} ${v.summary} ${v.detail ?? ''}`.toLowerCase().includes(w)));
}
