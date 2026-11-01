// 学習ダッシュボード（F-23）：章別の進捗・日別の学習量・ヒント使用率・ゴール日までの残り日数。
import { lazy, Suspense } from 'react';
import { chapters } from '../lesson/content';
import { chapterProgress, useProgress } from '../store/progress';
import { dailySeries, goalInfo, hintStats, ymd } from './dashboard';

const StudyChart = lazy(() => import('./StudyChart'));

function Tile({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/60 bg-white/40 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold">{children}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Dashboard() {
  const progress = useProgress();
  const setSettings = useProgress((s) => s.setSettings);
  const today = ymd(new Date());
  const minutes = Object.values(progress.studyLog).reduce((a, b) => a + b, 0);
  const done = Object.values(progress.lessons).filter((l) => l.status === 'done').length;
  const total = chapters.reduce((a, c) => a + chapterProgress(progress, c.id).total, 0);
  const hints = hintStats(progress.lessons);
  const goal = goalInfo(progress.settings.goalDate, progress.studyLog, today);
  const series = dailySeries(progress.studyLog, today, 14);
  const available = chapters.filter((c) => c.lessons.length);

  return (
    <section className="glass space-y-4 rounded-3xl p-4" data-testid="dashboard">
      <h2 className="font-bold">学習ダッシュボード</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="クリア" sub={`全 ${total} レッスン（章末チャレンジ含む）`}>
          {done}
          <span className="text-sm font-normal text-slate-500"> / {total}</span>
        </Tile>
        <Tile label="学習時間" sub={`今日 ${progress.studyLog[today] ?? 0} 分`}>
          {Math.floor(minutes / 60)}
          <span className="text-sm font-normal">時間</span>
          {minutes % 60}
          <span className="text-sm font-normal">分</span>
        </Tile>
        <Tile label="ヒント使用率" sub={hints.done ? `完了 ${hints.done} 件中 ${hints.withHints} 件でヒントを使用` : 'まだ完了したレッスンがありません'}>
          {Math.round(hints.rate * 100)}
          <span className="text-sm font-normal">%</span>
        </Tile>
        <Tile
          label="ゴールまで"
          sub={
            <label className="flex items-center gap-1">
              ゴール日
              <input type="date" value={goal.goal} onChange={(e) => e.target.value && setSettings({ goalDate: e.target.value })} className="glass-input py-0 text-xs" aria-label="ゴール日" />
            </label>
          }
        >
          {goal.daysLeft >= 0 ? (
            <>
              {goal.daysLeft}
              <span className="text-sm font-normal">日</span>
            </>
          ) : (
            <span className="text-base">{-goal.daysLeft}日 超過</span>
          )}
        </Tile>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="mb-1 text-xs font-bold text-slate-500">日別の学習時間（直近14日）</div>
          <div className="h-44 text-slate-500">
            <Suspense fallback={null}>
              <StudyChart data={series} />
            </Suspense>
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-bold text-slate-500">章別の進捗</div>
          <ul className="space-y-1.5 text-xs">
            {available.map((c) => {
              const p = chapterProgress(progress, c.id);
              return (
                <li key={c.id} className="flex items-center gap-2">
                  <span className="w-28 truncate">
                    第{c.number}章 {c.title}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/50 dark:bg-white/10">
                    <span className="block h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-500" style={{ width: `${(p.done / p.total) * 100}%` }} />
                  </span>
                  <span className="w-10 text-right text-slate-500">
                    {p.done}/{p.total}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
