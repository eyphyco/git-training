// 模擬 GitHub 画面の小さな部品。
import type { ReactNode } from 'react';

// 状態の札：薄い地＋枠＋色付きの文字（Pipeline Dojo の .status と同じ形）
const TONE = {
  green: 'border-emerald-600/30 bg-emerald-500/13 text-emerald-700 dark:text-emerald-300',
  red: 'border-rose-600/30 bg-rose-500/11 text-rose-700 dark:text-rose-300',
  purple: 'border-violet-500/35 bg-violet-500/15 text-violet-700 dark:text-violet-300',
  gray: 'border-slate-500/30 bg-slate-500/13 text-slate-600 dark:text-slate-300',
} as const;

export function Badge({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return <span className={`inline-block rounded-full border px-2 text-[11px] leading-[1.8] font-bold whitespace-nowrap ${TONE[tone]}`}>{children}</span>;
}

export function Avatar({ name }: { name: string }) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white align-middle" style={{ background: `hsl(${hue} 55% 50%)` }} aria-hidden>
      {name[0]?.toUpperCase()}
    </span>
  );
}

export function Box({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[14px] border border-[var(--edge)] bg-[var(--raised)] shadow-[0_1px_2px_rgb(30_50_90/0.06)]">
      {title && <div className="border-b border-[var(--line)] px-3 py-1.5 text-xs font-bold">{title}</div>}
      <div className="px-3 py-2">{children}</div>
    </section>
  );
}

export function TabBar({ tabs, active, onChange }: { tabs: [string, string][]; active: string; onChange(k: string): void }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-white/40 px-2 text-xs dark:border-white/10">
      {tabs.map(([k, label]) => (
        <button key={k} type="button" onClick={() => onChange(k)} className={`shrink-0 border-b-2 px-2.5 py-1.5 ${active === k ? 'border-orange-500 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}>
          {label}
        </button>
      ))}
    </nav>
  );
}
