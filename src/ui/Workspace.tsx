// レッスン画面とフリープレイで共通の作業領域：グラフ（再生付き）・「今何が起きた？」・4エリア / エディタ・ターミナル。
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { pendingEditor } from '../engine/editor';
import type { Session } from '../lesson/session';
import { useLesson } from '../store/lesson';
import { useProgress } from '../store/progress';
import { previewOf } from './preview';
import { AreaView } from './AreaView';
import { Graph } from './graph/Graph';
import { GuiButtons } from './GuiButtons';
import { ReplayBar } from './ReplayBar';
import { promptFor, Terminal } from './Terminal';

const Editor = lazy(() => import('./editor/Editor'));
const GitHubView = lazy(() => import('./github/GitHubView').then((m) => ({ default: m.GitHubView })));

export type MobileTab = 'task' | 'visual' | 'terminal';

export function MobileTabs({ tab, onChange, first }: { tab: MobileTab; onChange(t: MobileTab): void; first: string }) {
  return (
    <nav className="glass mx-2 mt-2 flex rounded-xl text-sm lg:hidden">
      {(
        [
          ['task', first],
          ['visual', '可視化'],
          ['terminal', 'ターミナル'],
        ] as const
      ).map(([t, label]) => (
        <button key={t} type="button" onClick={() => onChange(t)} className={`flex-1 py-2 ${tab === t ? 'border-b-2 border-sky-500 font-bold' : 'text-slate-500'}`}>
          {label}
        </button>
      ))}
    </nav>
  );
}

/** 左ペイン＋作業領域の3ペイン（スマホ幅ではタブで1つずつ） */
export function WorkspaceLayout({ tab, left, session, resetKey }: { tab: MobileTab; left: ReactNode; session: Session; resetKey: string }) {
  const pane = (t: MobileTab) => (tab === t ? 'flex' : 'hidden');
  return (
    <div className="flex min-h-0 flex-1 gap-3 p-2 lg:grid lg:grid-cols-[minmax(320px,400px)_1fr] lg:p-3">
      <div className={`${pane('task')} glass min-h-0 flex-1 flex-col overflow-hidden rounded-2xl lg:flex`}>{left}</div>
      <Workspace key={resetKey} session={session} pane={pane} />
    </div>
  );
}

function Workspace({ session, pane }: { session: Session; pane(t: MobileTab): string }) {
  const run = useLesson((s) => s.run);
  const save = useLesson((s) => s.save);
  const [view, setView] = useState<'areas' | 'editor' | 'github'>('areas');
  const [editing, setEditing] = useState<string | null>(null);
  const [replay, setReplay] = useState<number | null>(null);

  // 新しい操作をしたら再生をやめて「今」を表示する。git がエディタを開いたらエディタに切り替える
  useEffect(() => {
    setReplay(null);
    const opened = session.lastEvents.find((e) => e.type === 'EDITOR_OPENED');
    if (opened?.type === 'EDITOR_OPENED') {
      setView('editor');
      setEditing(opened.path);
    }
    // PR が作られた・レビューされたら GitHub タブを開く
    if (session.lastEvents.some((e) => e.type === 'PR_OPENED' || e.type === 'PR_REVIEWED')) setView('github');
  }, [session.seq, session.lastEvents]);
  const pending = pendingEditor(session.world);
  const draft = useLesson((s) => s.draft);
  const allowed = useLesson((s) => s.lesson?.allowedCommands);
  const previewOn = useProgress((s) => s.settings.preview ?? true);
  const setSettings = useProgress((s) => s.setSettings);
  const preview = useMemo(() => (previewOn && replay === null ? previewOf(session.world, draft, allowed) : null), [previewOn, replay, session.world, draft, allowed]);
  const hasGitHub = !!session.world.remotes.origin;
  const openPrs = session.world.hosting.pullRequests.filter((p) => p.state === 'open').length;

  const repo = session.world.local;
  const replaying = replay !== null && replay < session.timeline.length;
  const shown = replaying ? session.timeline[replay].world : session.world;
  const prev = replaying ? (replay > 0 ? session.timeline[replay - 1].world.local : null) : session.undo.length ? session.undo[session.undo.length - 1].local : null;
  const command = (cmd: string) => run(cmd, promptFor(repo));
  const highlight = session.lastEvents.flatMap((e) => (e.type === 'COMMIT_CREATED' ? [e.oid] : []));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 lg:grid lg:grid-rows-[minmax(150px,1fr)_auto_minmax(170px,1fr)_minmax(220px,0.9fr)]">
      <div className={`${pane('visual')} glass min-h-[180px] flex-1 flex-col overflow-hidden rounded-2xl lg:flex`}>
        <ReplayBar timeline={session.timeline} index={replaying ? replay : null} onChange={setReplay} />
        <div className="relative min-h-0 flex-1">
          {replaying && <div className="absolute top-2 right-3 z-10 rounded-full bg-sky-500/80 px-2 py-0.5 text-xs text-white">再生中（操作はできません）</div>}
          {preview && !replaying && (
            <div className="absolute top-2 right-3 left-3 z-10 rounded-xl border border-violet-300/70 bg-violet-100/80 px-2 py-1 text-xs text-violet-900 backdrop-blur-md dark:bg-violet-500/20 dark:text-violet-100" data-testid="preview-banner">
              👁 プレビュー：<code className="font-bold">{draft.trim()}</code> を Enter で実行するとこうなります（点線 = 新しくできるコミット、薄い × = どのブランチからも辿れなくなるコミット）
            </div>
          )}
          <Graph repo={preview && !replaying ? preview.local : shown.local} previewBase={preview && !replaying ? session.world.local : undefined} highlight={replaying || preview ? [] : highlight} />
          <label className="absolute right-3 bottom-1 z-10 flex items-center gap-1 text-[10px] text-slate-500">
            <input type="checkbox" checked={previewOn} onChange={(e) => setSettings({ preview: e.target.checked })} className="accent-violet-500" />
            実行プレビュー
          </label>
        </div>
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
              ['editor', `エディタ${editing ? `：${editing.split('/').pop()}` : ''}${pending ? ' ✎' : ''}`],
              ...(hasGitHub ? ([['github', `GitHub${openPrs ? `（PR ${openPrs}）` : ''}`]] as const) : []),
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setView(v)} className={`rounded-t-lg px-3 py-1 ${view === v ? 'bg-white/70 font-bold dark:bg-white/10' : 'text-slate-500'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1">
          {view === 'github' && hasGitHub ? (
            <Suspense fallback={<div className="p-4 text-sm text-slate-500">読み込み中…</div>}>
              <GitHubView world={shown} readOnly={replaying} />
            </Suspense>
          ) : view === 'areas' ? (
            <AreaView
              repo={shown.local}
              remote={shown.local.config.remotes?.origin ? shown.remotes.origin : undefined}
              prev={prev}
              events={replaying ? [] : session.lastEvents}
              seq={replaying ? replay : session.seq}
              onCommand={replaying ? () => {} : command}
              onOpenFile={(p) => {
                setEditing(p);
                setView('editor');
              }}
            />
          ) : (
            <Suspense fallback={<div className="p-4 text-sm text-slate-500">エディタを読み込み中…</div>}>
              <Editor repo={repo} pending={pending} path={editing} onSelect={setEditing} onSave={save} />
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
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="glass mx-2 mt-2 flex flex-wrap items-center gap-2 rounded-2xl px-4 py-2 lg:mx-3 lg:mt-3">
      <a href="#/" className="text-sm font-bold">
        Git Training
      </a>
      <span className="hidden truncate text-sm text-slate-500 sm:inline">/ {title}</span>
      <div className="ml-auto">{children}</div>
    </header>
  );
}
