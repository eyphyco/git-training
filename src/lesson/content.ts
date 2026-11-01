// 教材の読み込み。content/ にファイルを足すだけでレッスンが増える（コードの変更は不要）。
import chaptersJson from '../../content/chapters.json';
import type { Chapter, Lesson } from './types';

const jsonFiles = import.meta.glob<Lesson>('/content/lessons/**/*.json', { eager: true, import: 'default' });
const mdFiles = import.meta.glob<string>('/content/lessons/**/*.md', { eager: true, query: '?raw', import: 'default' });
const scenarioJson = import.meta.glob<Lesson>('/content/scenarios/*.json', { eager: true, import: 'default' });
const scenarioMd = import.meta.glob<string>('/content/scenarios/*.md', { eager: true, query: '?raw', import: 'default' });

export const chapters = chaptersJson as Chapter[];

export const lessons: Record<string, Lesson> = {};
for (const [path, lesson] of Object.entries(jsonFiles)) {
  const dir = path.slice(0, path.lastIndexOf('/') + 1);
  lessons[lesson.id] = { ...lesson, body: lesson.doc ? mdFiles[dir + lesson.doc] : undefined };
}

/** 実戦シナリオ（F-14）。第5章の章末チャレンジをクリアすると解放 */
export const scenarios: Lesson[] = Object.entries(scenarioJson)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, lesson]) => ({ ...lesson, body: lesson.doc ? scenarioMd[path.slice(0, path.lastIndexOf('/') + 1) + lesson.doc] : undefined }));
for (const sc of scenarios) lessons[sc.id] = sc;
export const SCENARIO_UNLOCK = 'ch05-challenge';

export function chapterOf(lessonId: string): Chapter | undefined {
  return chapters.find((c) => c.lessons.includes(lessonId) || c.challenge === lessonId || c.practice === lessonId);
}

/** 章内の順番（レッスン → 章末チャレンジ）で次のレッスン */
export function nextLessonId(lessonId: string): string | null {
  const si = scenarios.findIndex((s) => s.id === lessonId);
  if (si >= 0) return scenarios[si + 1]?.id ?? null;
  const ch = chapterOf(lessonId);
  if (!ch) return null;
  const order = [...ch.lessons, ...(ch.challenge ? [ch.challenge] : []), ...(ch.practice ? [ch.practice] : [])];
  const i = order.indexOf(lessonId);
  if (i >= 0 && i < order.length - 1) return order[i + 1];
  const nextCh = chapters[chapters.indexOf(ch) + 1];
  return nextCh?.lessons[0] ?? null;
}
