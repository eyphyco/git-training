// 教材の読み込み。content/ にファイルを足すだけでレッスンが増える（コードの変更は不要）。
import chaptersJson from '../../content/chapters.json';
import type { Chapter, Lesson } from './types';

const jsonFiles = import.meta.glob<Lesson>('/content/lessons/**/*.json', { eager: true, import: 'default' });
const mdFiles = import.meta.glob<string>('/content/lessons/**/*.md', { eager: true, query: '?raw', import: 'default' });

export const chapters = chaptersJson as Chapter[];

export const lessons: Record<string, Lesson> = {};
for (const [path, lesson] of Object.entries(jsonFiles)) {
  const dir = path.slice(0, path.lastIndexOf('/') + 1);
  lessons[lesson.id] = { ...lesson, body: lesson.doc ? mdFiles[dir + lesson.doc] : undefined };
}

export function chapterOf(lessonId: string): Chapter | undefined {
  return chapters.find((c) => c.lessons.includes(lessonId) || c.challenge === lessonId || c.practice === lessonId);
}

/** 章内の順番（レッスン → 章末チャレンジ）で次のレッスン */
export function nextLessonId(lessonId: string): string | null {
  const ch = chapterOf(lessonId);
  if (!ch) return null;
  const order = [...ch.lessons, ...(ch.challenge ? [ch.challenge] : []), ...(ch.practice ? [ch.practice] : [])];
  const i = order.indexOf(lessonId);
  if (i >= 0 && i < order.length - 1) return order[i + 1];
  const nextCh = chapters[chapters.indexOf(ch) + 1];
  return nextCh?.lessons[0] ?? null;
}
