// 模擬 GitHub 画面の小さな部品。
import type { ReactNode } from 'react';

const TONE = {
  green: 'bg-emerald-600 text-white',
  red: 'bg-rose-600 text-white',
  purple: 'bg-violet-600 text-white',
  gray: 'bg-slate-500 text-white',
} as const;

export function Badge({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${TONE[tone]}`}>{children}</span>;
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
    <section className="overflow-hidden rounded-xl border border-white/60 bg-white/40 backdrop-blur-md dark:border-white/10 dark:bg-white/5">
      {title && <div className="border-b border-white/60 bg-white/40 px-3 py-1.5 text-xs font-bold dark:border-white/10 dark:bg-white/5">{title}</div>}
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
