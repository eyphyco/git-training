// 章詳細（S-02）：章のゴール・レッスン一覧・章末チャレンジ。
import { chapters, lessons } from '../lesson/content';
import { isChapterUnlocked, useProgress } from '../store/progress';
import { href } from './router';

const STATUS = { todo: '', doing: '進行中', done: '✓ 完了' };

export function ChapterPage({ id }: { id: string }) {
  const progress = useProgress();
  const ch = chapters.find((c) => c.id === id);
  if (!ch) return <div className="p-8">章が見つかりません</div>;
  const unlocked = isChapterUnlocked(progress, id);
  const items = [...ch.lessons, ...(ch.challenge ? [ch.challenge] : [])];
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-8">
      <a href={href.home()} className="text-sm text-slate-500 hover:underline">
        ← ホーム
      </a>
      <header>
        <div className="text-sm text-slate-500">
          第{ch.number}章・{ch.level}
        </div>
        <h1 className="text-2xl font-bold">{ch.title}</h1>
        <p className="mt-2 rounded-lg bg-sky-100/50 p-3 text-sm backdrop-blur-md dark:bg-sky-500/10">
          <b>この章のゴール：</b>
          {ch.goal}
        </p>
      </header>
      {!unlocked && <p className="rounded-xl bg-amber-100/60 p-3 text-sm dark:bg-amber-500/10">🔒 前の章の章末チャレンジをクリアすると解放されます。</p>}
      <ol className="space-y-2">
        {items.map((lid, i) => {
          const l = lessons[lid];
          const st = progress.lessons[lid]?.status ?? 'todo';
          return (
            <li key={lid}>
              <a
                href={unlocked ? href.lesson(lid) : undefined}
                className={`flex items-center gap-3 rounded-xl border p-3 ${l.challenge ? 'border-violet-400/70' : 'border-white/60 dark:border-white/10'} bg-white/45 backdrop-blur-xl dark:bg-slate-900/45 ${unlocked ? 'hover:border-sky-500' : 'pointer-events-none opacity-60'}`}
                data-testid={`lesson-${lid}`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${st === 'done' ? 'bg-emerald-500 text-white' : 'bg-white/50 dark:bg-white/10'}`}>{l.challenge ? '★' : i + 1}</span>
                <span className="flex-1">
                  {l.challenge && <span className="mr-2 text-xs text-violet-600">章末チャレンジ</span>}
                  {l.title}
                </span>
                <span className="text-xs text-emerald-600">{STATUS[st]}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
