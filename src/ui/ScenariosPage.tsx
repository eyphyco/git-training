// 実戦シナリオの一覧（F-14）。第5章の章末チャレンジをクリアすると解放。
import { SCENARIO_UNLOCK, scenarios } from '../lesson/content';
import { useProgress } from '../store/progress';
import { href } from './router';

export function ScenariosPage() {
  const lessons = useProgress((s) => s.lessons);
  const unlocked = lessons[SCENARIO_UNLOCK]?.status === 'done';
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-8">
      <a href={href.home()} className="text-sm text-[var(--muted)] hover:underline">
        ← ホーム
      </a>
      <header className="space-y-1">
        <div className="eyebrow">SCENARIOS</div>
        <h1 className="text-2xl font-extrabold">実戦シナリオ</h1>
        <p className="text-sm text-[var(--muted)]">チームメンバー（Bot）がチャットで連絡し、push や PR をしてきます。その中で自分のタスクを完了させましょう。ヒント・ルール違反・force push・Undo で減点されます（時間は数えません）。</p>
      </header>
      {!unlocked && <div className="glass rounded-3xl p-4 text-sm">🔒 第5章の章末チャレンジをクリアすると解放されます。</div>}
      <ul className="grid gap-3 sm:grid-cols-3">
        {scenarios.map((s, i) => {
          const st = lessons[s.id];
          const body = (
            <>
              <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <span>シナリオ {i + 1}</span>
                {st?.status === 'done' && <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 font-bold text-emerald-700 dark:text-emerald-300">クリア{st.score !== undefined ? ` ${st.score} 点` : ''}</span>}
              </div>
              <div className="mt-1 font-bold">{s.title}</div>
              <p className="mt-1 text-xs text-[var(--muted)]">{s.scenario?.summary}</p>
              <div className="mt-2 text-xs">👥 {s.scenario?.members.join('・')}</div>
            </>
          );
          return (
            <li key={s.id}>
              {unlocked ? (
                <a href={href.lesson(s.id)} className="glass block h-full rounded-3xl p-4 transition hover:-translate-y-0.5" data-testid={`scenario-${s.id}`}>
                  {body}
                </a>
              ) : (
                <div className="glass h-full rounded-3xl p-4 opacity-60">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
