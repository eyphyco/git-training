// レッスン画面（S-03）。PC は3ペイン、スマホ幅は 課題 / 可視化 / ターミナル のタブ切替。
import { useEffect, useState } from 'react';
import { lessons } from '../lesson/content';
import { useLesson } from '../store/lesson';
import { useProgress } from '../store/progress';
import { LessonPanel } from './LessonPanel';
import { href } from './router';
import { Toolbar } from './Toolbar';
import { MobileTabs, PageHeader, WorkspaceLayout, type MobileTab } from './Workspace';

export function LessonPage({ id }: { id: string }) {
  const lesson = lessons[id];
  const open = useLesson((s) => s.open);
  const current = useLesson((s) => s.lesson);
  const session = useLesson((s) => s.session);
  const addMinutes = useProgress((s) => s.addStudyMinutes);
  const [tab, setTab] = useState<MobileTab>('task');

  useEffect(() => {
    if (lesson) open(lesson);
  }, [lesson, open]);

  // 画面を開いている時間を学習時間として記録（1分ごと）
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && addMinutes(1), 60_000);
    return () => clearInterval(t);
  }, [addMinutes]);

  if (!lesson)
    return (
      <div className="p-8">
        レッスン「{id}」は見つかりません。
        <a className="text-sky-600 underline" href={href.home()}>
          ホームへ
        </a>
      </div>
    );
  if (!session || current?.id !== id) return null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={lesson.title}>
        <Toolbar />
      </PageHeader>
      <MobileTabs tab={tab} onChange={setTab} first="課題" />
      <WorkspaceLayout tab={tab} session={session} resetKey={lesson.id} left={<LessonPanel lesson={lesson} session={session} />} />
    </div>
  );
}
