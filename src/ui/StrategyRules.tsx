// 今のブランチ戦略のルールと、起きたルール違反（レッスン画面と戦略シミュレータで共通）。
import type { World } from '../engine/model/types';
import { STRATEGIES } from '../lesson/strategy';

export function StrategyRules({ world, compact }: { world: World; compact?: boolean }) {
  const id = world.hosting.strategy;
  if (!id) return null;
  const s = STRATEGIES[id];
  const v = world.hosting.violations ?? [];
  return (
    <div className="space-y-2 rounded-xl border border-[var(--edge)] bg-[var(--raised)] p-3 text-sm" data-testid="strategy-rules">
      <div className="flex items-center gap-2">
        <span className="eyebrow">STRATEGY</span>
        <b>{s.name}</b>
        <span className={`ml-auto rounded-full border px-2 text-[11px] font-bold ${v.length ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`} data-testid="violation-count">
          {v.length ? `⚠ 違反 ${v.length} 件` : '✓ 違反なし'}
        </span>
      </div>
      {!compact && <p className="text-xs text-[var(--muted)]">{s.summary}</p>}
      <ul className="list-disc space-y-0.5 pl-5 text-xs">
        {s.rules.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {v.length > 0 && (
        <ul className="space-y-1 text-xs">
          {v.slice(-3).map((x, i) => (
            <li key={i} className="rounded-lg bg-rose-500/10 px-2 py-1 text-rose-700 dark:text-rose-300">
              ⚠ {x}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
