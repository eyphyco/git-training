// レッスン画面（S-03）。PC は3ペイン、スマホ幅は 課題 / 可視化 / ターミナル のタブ切替。
import { lazy, Suspense, useEffect, useState } from 'react';
import { lessons } from '../lesson/content';
import { useLesson } from '../store/lesson';
import { useProgress } from '../store/progress';
import { AreaView } from './AreaView';
import { Graph } from './graph/Graph';
import { GuiButtons } from './GuiButtons';
import { LessonPanel } from './LessonPanel';
import { href } from './router';
import { promptFor, Terminal } from './Terminal';
import { Toolbar } from './Toolbar';

const Editor = lazy(() => import('./editor/Editor'));

type MobileTab = 'task' | 'visual' | 'terminal';

export function LessonPage({ id }: { id: string }) {
  const lesson = lessons[id];
  const open = useLesson((s) => s.open);
  const current = useLesson((s) => s.lesson);
  const session = useLesson((s) => s.session);
  const run = useLesson((s) => s.run);
  const save = useLesson((s) => s.save);
  const addMinutes = useProgress((s) => s.addStudyMinutes);
  const [tab, setTab] = useState<MobileTab>('task');
  const [view, setView] = useState<'areas' | 'editor'>('areas');
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    if (lesson) open(lesson);
    setEditing(null);
    setView('areas');
  }, [lesson, open]);

  // 画面を開いている時間を学習時間として記録（1分ごと）
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && addMinutes(1), 60_000);
    return () => clearInterval(t);
  }, [addMinutes]);

  if (!lesson) return <div className="p-8">レッスン「{id}」は見つかりません。<a className="text-sky-600 underline" href={href.home()}>ホームへ</a></div>;
  if (!session || current?.id !== id) return null;

  const repo = session.world.local;
  const prev = session.undo.length ? session.undo[session.undo.length - 1].local : null;
  const command = (cmd: string) => run(cmd, promptFor(repo));
  const highlight = session.lastEvents.flatMap((e) => (e.type === 'COMMIT_CREATED' ? [e.oid] : []));
  const pane = (t: MobileTab) => (tab === t ? 'flex' : 'hidden');

  return (
    <div className="flex h-full flex-col">
      <header className="glass mx-2 mt-2 flex flex-wrap items-center gap-2 rounded-2xl px-4 py-2 lg:mx-3 lg:mt-3">
        <a href={href.home()} className="text-sm font-bold">
          Git Training
        </a>
        <span className="hidden truncate text-sm text-slate-500 sm:inline">/ {lesson.title}</span>
        <div className="ml-auto">
          <Toolbar />
        </div>
      </header>
      <nav className="glass mx-2 mt-2 flex rounded-xl text-sm lg:hidden">
        {(
          [
            ['task', '課題'],
            ['visual', '可視化'],
            ['terminal', 'ターミナル'],
          ] as const
        ).map(([t, label]) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`flex-1 py-2 ${tab === t ? 'border-b-2 border-sky-500 font-bold' : 'text-slate-500'}`}>
            {label}
          </button>
        ))}
      </nav>
      <div className="flex min-h-0 flex-1 gap-3 p-2 lg:grid lg:grid-cols-[minmax(320px,400px)_1fr] lg:p-3">
        <div className={`${pane('task')} glass min-h-0 flex-1 flex-col overflow-hidden rounded-2xl lg:flex`}>
          <LessonPanel lesson={lesson} session={session} />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 lg:grid lg:grid-rows-[minmax(150px,1fr)_auto_minmax(170px,1fr)_minmax(220px,0.9fr)]">
          <div className={`${pane('visual')} glass min-h-[180px] flex-1 flex-col overflow-hidden rounded-2xl lg:flex`}>
            <Graph repo={repo} highlight={highlight} />
          </div>
          <div className={`${pane('visual')} items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-100/50 px-3 py-1.5 text-sm backdrop-blur-xl lg:flex dark:border-amber-400/20 dark:bg-amber-500/10`} aria-live="polite" data-testid="summary">
            <span className="shrink-0 font-bold text-amber-700 dark:text-amber-300">今何が起きた？</span>
            <span>{session.summary ?? 'コマンドを実行すると、ここに何が起きたかが表示されます。'}</span>
          </div>
          <div className={`${pane('visual')} glass min-h-0 flex-1 flex-col overflow-hidden rounded-2xl lg:flex`}>
            <div className="flex gap-1 border-b border-white/40 px-2 pt-1.5 text-xs dark:border-white/10">
              {(
                [
                  ['areas', '4エリア'],
                  ['editor', `エディタ${editing ? `：${editing}` : ''}`],
                ] as const
              ).map(([v, label]) => (
                <button key={v} type="button" onClick={() => setView(v)} className={`rounded-t-lg px-3 py-1 ${view === v ? 'bg-white/70 font-bold dark:bg-white/10' : 'text-slate-500'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              {view === 'areas' ? (
                <AreaView
                  repo={repo}
                  remote={repo.config.remotes?.origin ? session.world.remotes.origin : undefined}
                  prev={prev}
                  events={session.lastEvents}
                  seq={session.seq}
                  onCommand={command}
                  onOpenFile={(p) => {
                    setEditing(p);
                    setView('editor');
                  }}
                />
              ) : (
                <Suspense fallback={<div className="p-4 text-sm text-slate-500">エディタを読み込み中…</div>}>
                  <Editor repo={repo} path={editing} onSelect={setEditing} onSave={save} />
                </Suspense>
              )}
            </div>
          </div>
          <div className={`${pane('terminal')} glass-dark min-h-0 flex-1 flex-col overflow-hidden rounded-2xl lg:flex`}>
            <div className="min-h-0 flex-1">
              <Terminal repo={repo} />
            </div>
            <GuiButtons repo={repo} onCommand={command} />
          </div>
        </div>
      </div>
    </div>
  );
}
