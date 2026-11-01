// フリープレイ（S-07, F-16）。課題なしで自由に操作し、状態を JSON / URL で書き出し・読み込みできる。
import { useEffect, useRef, useState } from 'react';
import { teammatePush } from '../engine/remote';
import { applyHostingEvent } from '../hosting/events';
import { createWorld } from '../engine/world';
import type { Lesson, Setup } from '../lesson/types';
import { FREEPLAY_ID, useLesson } from '../store/lesson';
import { useProgress } from '../store/progress';
import { href } from './router';
import { decodeWorld, encodeWorld, parseWorldJson, worldToJson } from './share';
import { Toolbar } from './Toolbar';
import { MobileTabs, PageHeader, WorkspaceLayout, type MobileTab } from './Workspace';

const TEMPLATES: { id: string; label: string; note: string; setup: Setup }[] = [
  { id: 'empty', label: '空のリポジトリ', note: 'git init 済みの空のリポジトリ', setup: {} },
  { id: 'uninit', label: 'git init 前', note: 'README.md だけがあるフォルダ', setup: { initialized: false, workingTree: { 'README.md': '# My Project\n' } } },
  {
    id: 'remote',
    label: 'origin 付き（チーム開発）',
    note: 'GitHub の origin を clone 済み。「同僚が push」ボタンで他人の変更を起こせます',
    setup: {
      commits: [{ id: 'c1', msg: 'init', files: { 'README.md': '# Team Project\n' } }],
      branches: { main: 'c1' },
      remotes: { origin: { url: 'https://github.com/team/project.git', branches: { main: 'c1' } } },
    },
  },
];

const AUTOSAVE = `${FREEPLAY_ID}:（自動保存）`;

const lessonFor = (setup: Setup): Lesson => ({ id: FREEPLAY_ID, title: 'フリープレイ', level: 'beginner', setup, steps: [] });

function PlayPanel() {
  const session = useLesson((s) => s.session)!;
  const { openWorld, apply } = useLesson.getState();
  const [author, setAuthor] = useState('Sato');
  const [conflict, setConflict] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const world = session.world;
  const origin = world.local.config.remotes?.origin && world.remotes.origin;

  const start = (t: (typeof TEMPLATES)[number]) => {
    if (session.timeline.length > 1 && !confirm('今の状態を破棄して始めますか？（📷 保存で残せます）')) return;
    openWorld(lessonFor(t.setup), createWorld(t.setup).world, `テンプレート「${t.label}」で開始しました`);
  };

  const push = () => {
    const remote = world.remotes.origin;
    const branch = remote.head.type === 'symbolic' ? remote.head.ref : 'main';
    const n = Object.keys(remote.refs.heads).length + Math.floor(world.clock / 60) % 1000;
    const files: Record<string, string> = conflict ? { 'README.md': `# ${author} が書き換えたタイトル\n` } : { [`${author.toLowerCase()}-${n}.txt`]: `${author} の作業 #${n}\n` };
    const r = teammatePush(world, { author, branch, message: conflict ? `${author}: README を変更` : `${author}: 作業 #${n}`, files });
    apply(r.world, r.events, `（${author} さんが push）`, `同僚の ${author} さんが origin/${branch} に push しました。git fetch / git pull で取り込めます。`);
  };

  const openPr = () => {
    const n = world.hosting.pullRequests.length + 1;
    const head = `${author.toLowerCase()}/feature-${n}`;
    const r = applyHostingEvent(world, { type: 'openPr', author, head, title: `${author} の機能 #${n}`, body: 'レビューをお願いします。', message: `${author}: add feature ${n}`, files: { [`${author.toLowerCase()}-feature-${n}.txt`]: `${author} の機能 #${n}\n` } });
    apply(r.world, r.events, `（${author} さんが PR #${n}）`, `${r.summary} gh pr checkout ${n} で取り込み、gh pr review ${n} --approve で承認できます。`);
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-sm">
      <div>
        <h1 className="text-lg font-bold">フリープレイ</h1>
        <p className="text-slate-500">課題なしで自由に操作できます。進捗には記録されません。</p>
      </div>
      <section>
        <h2 className="mb-1.5 text-xs font-bold text-slate-500">はじめる</h2>
        <div className="flex flex-col gap-1.5">
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" className="glass-btn px-3 py-2 text-left" onClick={() => start(t)}>
              <div className="font-bold">{t.label}</div>
              <div className="text-xs text-slate-500">{t.note}</div>
            </button>
          ))}
        </div>
      </section>
      {origin && (
        <section className="rounded-xl border border-white/60 bg-white/30 p-3 dark:border-white/10 dark:bg-white/5">
          <h2 className="mb-1.5 text-xs font-bold text-slate-500">同僚の操作を起こす</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select value={author} onChange={(e) => setAuthor(e.target.value)} className="glass-input py-1">
              {['Sato', 'Suzuki', 'Tanaka'].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            <button type="button" className="glass-btn px-3 py-1 font-bold" onClick={push} data-testid="teammate-push">
              さんが push
            </button>
            <button type="button" className="glass-btn px-3 py-1 font-bold" onClick={openPr} data-testid="teammate-pr">
              さんが PR を作る
            </button>
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={conflict} onChange={(e) => setConflict(e.target.checked)} className="accent-sky-500" />
            README.md の1行目を書き換える（コンフリクトの練習）
          </label>
        </section>
      )}
      <section>
        <h2 className="mb-1.5 text-xs font-bold text-slate-500">書き出し・読み込み</h2>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="glass-btn px-3 py-1"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([worldToJson(world)], { type: 'application/json' }));
              Object.assign(document.createElement('a'), { href: url, download: 'git-training-freeplay.json' }).click();
              URL.revokeObjectURL(url);
            }}
          >
            JSON で保存
          </button>
          <button type="button" className="glass-btn px-3 py-1" onClick={() => file.current?.click()}>
            JSON を読み込む
          </button>
          <button
            type="button"
            className="glass-btn px-3 py-1"
            onClick={async () => {
              const url = `${location.origin}${location.pathname}${href.play(await encodeWorld(world))}`;
              setShareUrl(url);
              await navigator.clipboard?.writeText(url).catch(() => {});
            }}
          >
            URL を作る
          </button>
        </div>
        {shareUrl && (
          <div className="mt-2">
            <div className="text-xs text-emerald-700 dark:text-emerald-300">URL をクリップボードにコピーしました（状態はすべて URL の中に入っていて、どこにも送信されません）。</div>
            <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} className="glass-input mt-1 w-full py-1 font-mono text-xs" />
          </div>
        )}
        <input
          ref={file}
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              openWorld(lessonFor({}), parseWorldJson(await f.text()), `${f.name} を読み込みました`);
            } catch (err) {
              alert((err as Error).message);
            }
          }}
        />
      </section>
    </div>
  );
}

export function FreePlayPage({ state }: { state?: string }) {
  const session = useLesson((s) => s.session);
  const lesson = useLesson((s) => s.lesson);
  const snapshots = useProgress((s) => s.snapshots);
  const saveSnapshot = useProgress((s) => s.saveSnapshot);
  const [tab, setTab] = useState<MobileTab>('task');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { openWorld } = useLesson.getState();
    if (state) {
      decodeWorld(state)
        .then((w) => openWorld(lessonFor({}), w, 'URL から状態を読み込みました'))
        .catch(() => setError('URL の状態を読み込めませんでした'));
      return;
    }
    if (useLesson.getState().lesson?.id === FREEPLAY_ID) return;
    const saved = useProgress.getState().snapshots[AUTOSAVE];
    if (saved) openWorld(lessonFor({}), saved, '前回のフリープレイの続きから再開しました');
    else openWorld(lessonFor(TEMPLATES[2].setup), createWorld(TEMPLATES[2].setup).world, 'テンプレート「origin 付き」で開始しました');
  }, [state]);

  // 再読み込みしても続けられるよう自動保存する
  useEffect(() => {
    if (lesson?.id === FREEPLAY_ID && session && session.world !== snapshots[AUTOSAVE]) saveSnapshot(AUTOSAVE, session.world);
  }, [lesson, session, snapshots, saveSnapshot]);

  if (error) return <div className="p-8">{error}</div>;
  if (!session || lesson?.id !== FREEPLAY_ID) return null;
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="フリープレイ">
        <Toolbar />
      </PageHeader>
      <MobileTabs tab={tab} onChange={setTab} first="操作" />
      <WorkspaceLayout tab={tab} session={session} resetKey={FREEPLAY_ID} left={<PlayPanel />} />
    </div>
  );
}
