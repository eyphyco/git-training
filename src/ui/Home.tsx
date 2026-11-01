// ホーム（S-01）：続きから再開・章マップ・学習時間とクリア数・設定とバックアップ。
import { useRef } from 'react';
import { chapters, lessons } from '../lesson/content';
import { chapterProgress, isChapterUnlocked, useProgress } from '../store/progress';
import { href } from './router';

function Settings() {
  const settings = useProgress((s) => s.settings);
  const setSettings = useProgress((s) => s.setSettings);
  const exportJson = useProgress((s) => s.exportJson);
  const importJson = useProgress((s) => s.importJson);
  const file = useRef<HTMLInputElement>(null);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-2 font-bold">設定</h2>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          テーマ
          <select value={settings.theme} onChange={(e) => setSettings({ theme: e.target.value as 'light' | 'dark' })} className="rounded border border-slate-300 bg-transparent px-1 dark:border-slate-700">
            <option value="light">ライト</option>
            <option value="dark">ダーク</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          アニメーション
          <select value={settings.animationSpeed} onChange={(e) => setSettings({ animationSpeed: Number(e.target.value) })} className="rounded border border-slate-300 bg-transparent px-1 dark:border-slate-700">
            <option value={0}>停止</option>
            <option value={0.5}>ゆっくり</option>
            <option value={1}>ふつう</option>
            <option value={2}>速い</option>
          </select>
        </label>
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
            const a = Object.assign(document.createElement('a'), { href: url, download: `git-training-progress-${new Date().toISOString().slice(0, 10)}.json` });
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          進捗をエクスポート
        </button>
        <button type="button" className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700" onClick={() => file.current?.click()}>
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
  const totalLessons = Object.keys(lessons).length;
  const minutes = Object.values(progress.studyLog).reduce((a, b) => a + b, 0);
  const resume = progress.resume && lessons[progress.resume.lessonId];
  const firstTodo = chapters.flatMap((c) => [...c.lessons, ...(c.challenge ? [c.challenge] : [])]).find((id) => progress.lessons[id]?.status !== 'done');
  const target = resume?.id ?? firstTodo;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold">Git Training</h1>
        <p className="text-sm text-slate-500">Git と GitHub の操作を、動く図で見ながら身につける</p>
      </header>

      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        {target && (
          <a href={href.lesson(target)} className="rounded-lg bg-sky-600 px-5 py-3 font-bold text-white shadow hover:bg-sky-700" data-testid="resume">
            {resume ? '続きから再開' : doneCount ? '次のレッスンへ' : 'はじめる'} → {lessons[target].title}
          </a>
        )}
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-slate-500">クリア</dt>
            <dd className="text-xl font-bold">
              {doneCount}
              <span className="text-sm font-normal text-slate-500"> / {totalLessons}</span>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">学習時間</dt>
            <dd className="text-xl font-bold">
              {Math.floor(minutes / 60)}
              <span className="text-sm font-normal">時間</span>
              {minutes % 60}
              <span className="text-sm font-normal">分</span>
            </dd>
          </div>
        </dl>
      </section>

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
                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
                    <div className="h-full bg-emerald-500" style={{ width: `${(p.done / p.total) * 100}%` }} />
                  </div>
                )}
              </>
            );
            const cls = 'block h-full rounded-xl border p-3';
            return (
              <li key={c.id}>
                {available && unlocked ? (
                  <a href={href.chapter(c.id)} className={`${cls} border-slate-200 bg-white hover:border-sky-500 dark:border-slate-800 dark:bg-slate-900`} data-testid={`chapter-${c.id}`}>
                    {body}
                  </a>
                ) : (
                  <div className={`${cls} border-dashed border-slate-300 opacity-60 dark:border-slate-700`}>{body}</div>
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
