// ホーム（S-01）：続きから再開・章マップ・学習時間とクリア数・設定とバックアップ。
import { useRef } from 'react';
import { chapters, lessons } from '../lesson/content';
import { chapterProgress, isChapterUnlocked, useProgress } from '../store/progress';
import { Dashboard } from './Dashboard';
import { href } from './router';

function Settings() {
  const settings = useProgress((s) => s.settings);
  const setSettings = useProgress((s) => s.setSettings);
  const exportJson = useProgress((s) => s.exportJson);
  const importJson = useProgress((s) => s.importJson);
  const file = useRef<HTMLInputElement>(null);
  return (
    <section className="glass rounded-3xl p-4 text-sm">
      <h2 className="mb-2 font-bold">設定</h2>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          テーマ
          <select value={settings.theme} onChange={(e) => setSettings({ theme: e.target.value as 'light' | 'dark' })} className="glass-input py-0.5">
            <option value="light">ライト</option>
            <option value="dark">ダーク</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          アニメーション
          <select value={settings.animationSpeed} onChange={(e) => setSettings({ animationSpeed: Number(e.target.value) })} className="glass-input py-0.5">
            <option value={0}>停止</option>
            <option value={0.5}>ゆっくり</option>
            <option value={1}>ふつう</option>
            <option value={2}>速い</option>
          </select>
        </label>
        <button
          type="button"
          className="glass-btn px-2 py-1"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
            const a = Object.assign(document.createElement('a'), { href: url, download: `git-training-progress-${new Date().toISOString().slice(0, 10)}.json` });
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          進捗をエクスポート
        </button>
        <button type="button" className="glass-btn px-2 py-1" onClick={() => file.current?.click()}>
          インポート
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              if (confirm('今の進捗を上書きしますか？')) importJson(await f.text());
            } catch (err) {
              alert((err as Error).message);
            }
            e.target.value = '';
          }}
        />
      </div>
    </section>
  );
}

export function Home() {
  const progress = useProgress();
  const doneCount = Object.values(progress.lessons).filter((l) => l.status === 'done').length;
  const resume = progress.resume && lessons[progress.resume.lessonId];
  const firstTodo = chapters.flatMap((c) => [...c.lessons, ...(c.challenge ? [c.challenge] : [])]).find((id) => progress.lessons[id]?.status !== 'done');
  const target = resume?.id ?? firstTodo;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <header className="space-y-1">
        <div className="eyebrow">GIT TRAINING</div>
        <h1 className="text-3xl font-extrabold tracking-tight">Git と GitHub を、動く図で身につける</h1>
        <p className="text-sm text-[var(--muted)]">ブラウザの中のシミュレータで、コミットからチーム開発・履歴の復旧まで。外部には何も送信しません。</p>
      </header>

      <section className="glass flex flex-wrap items-center gap-3 rounded-3xl p-4">
        {target && (
          <a href={href.lesson(target)} className="btn-primary px-5 py-3" data-testid="resume">
            {resume ? '続きから再開' : doneCount ? '次のレッスンへ' : 'はじめる'} → {lessons[target].title}
          </a>
        )}
        <a href={href.play()} className="glass-btn px-4 py-3 font-bold" data-testid="nav-play">
          🧪 フリープレイ
        </a>
        <a href={href.commands()} className="glass-btn px-4 py-3 font-bold" data-testid="nav-commands">
          📖 コマンド辞典
        </a>
        <a href={href.compare()} className="glass-btn px-4 py-3 font-bold" data-testid="nav-compare">
          ⚖️ 比較ビュー
        </a>
      </section>

      <Dashboard />

      <section>
        <h2 className="mb-3 font-bold">章マップ</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {chapters.map((c) => {
            const unlocked = isChapterUnlocked(progress, c.id);
            const available = c.lessons.length > 0;
            const p = chapterProgress(progress, c.id);
            const body = (
              <>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="rounded bg-slate-200 px-1.5 dark:bg-slate-800">{c.level}</span>第{c.number}章
                  {!available ? <span className="ml-auto">フェーズ{c.phase}で追加予定</span> : !unlocked ? <span className="ml-auto">🔒 前の章をクリア</span> : p.done === p.total ? <span className="ml-auto text-emerald-600">✓ 完了</span> : null}
                </div>
                <div className="mt-1 font-bold">{c.title}</div>
                <div className="mt-1 text-xs text-slate-500">{c.commands}</div>
                {available && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-white/50 dark:bg-white/10">
                    <div className="h-full bg-emerald-500" style={{ width: `${(p.done / p.total) * 100}%` }} />
                  </div>
                )}
              </>
            );
            const cls = 'block h-full rounded-xl border p-3';
            return (
              <li key={c.id}>
                {available && unlocked ? (
                  <a href={href.chapter(c.id)} className={`${cls} glass hover:border-sky-400 hover:bg-white/60 dark:hover:bg-slate-900/60 transition`} data-testid={`chapter-${c.id}`}>
                    {body}
                  </a>
                ) : (
                  <div className={`${cls} border-dashed border-white/60 bg-white/20 opacity-70 dark:border-white/10 dark:bg-white/5`}>{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
      <Settings />
    </div>
  );
}
