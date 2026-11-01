// 比較ビュー（S-05, F-12）：同じ初期状態を左右に並べ、別々の操作をして履歴の違いを見比べる。
import { useEffect, useRef, useState } from 'react';
import { execute } from '../engine/run';
import { createWorld } from '../engine/world';
import type { OutputLine, World } from '../engine/model/types';
import { applyHostingEvent } from '../hosting/events';
import { PROGRAMS } from '../lesson/session';
import { PRESETS, type ComparePreset, type Side } from './comparePresets';
import { Graph } from './graph/Graph';
import { href } from './router';
import { promptFor } from './Terminal';

function initial(p: ComparePreset): World {
  let w = createWorld(p.setup).world;
  for (const e of p.events ?? []) w = applyHostingEvent(w, e).world;
  return w;
}

type Line = { text: string; tone: OutputLine['tone'] | 'cmd' };

function Column({ preset, side, testid }: { preset: ComparePreset; side: Side; testid: string }) {
  const [world, setWorld] = useState(() => initial(preset));
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [step, setStep] = useState(0);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [lines]);

  const run = (w: World, line: string) => {
    const r = execute(w, line, { programs: PROGRAMS });
    setLines((ls): Line[] => [...ls, { text: `${promptFor(w.local)} ${line}`, tone: 'cmd' as const }, ...r.output.map((o) => ({ text: o.text, tone: o.tone }))].slice(-300));
    setWorld(r.world);
    return r.world;
  };
  const next = () => {
    if (step >= side.steps.length) return;
    run(world, side.steps[step]);
    setStep(step + 1);
  };
  const all = () => {
    let w = world;
    for (const l of side.steps.slice(step)) w = run(w, l);
    setStep(side.steps.length);
  };
  const reset = () => {
    setWorld(initial(preset));
    setLines([]);
    setStep(0);
  };

  return (
    <div className="glass flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl" data-testid={testid}>
      <div className="flex flex-wrap items-center gap-2 border-b border-white/40 px-3 py-2 dark:border-white/10">
        <span className="font-bold">{side.label}</span>
        <span className="ml-auto" />
        <button type="button" className="glass-btn px-2 py-0.5 text-xs" onClick={next} disabled={step >= side.steps.length}>
          ▶ 1手進める
        </button>
        <button type="button" className="glass-btn px-2 py-0.5 text-xs font-bold" onClick={all} disabled={step >= side.steps.length} data-testid={`${testid}-run`}>
          ⏩ 全部実行
        </button>
        <button type="button" className="glass-btn px-2 py-0.5 text-xs" onClick={reset}>
          ⟲ 最初から
        </button>
      </div>
      <ol className="flex flex-wrap gap-1 px-3 pt-2 font-mono text-[11px]">
        {side.steps.map((s, i) => (
          <li key={i} className={`rounded px-1.5 py-0.5 ${i < step ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200' : 'bg-slate-500/10 text-slate-500'}`}>
            {s}
          </li>
        ))}
      </ol>
      <div className="h-56 min-h-0 shrink-0">
        <Graph repo={world.local} />
      </div>
      <div className="border-t border-white/40 px-3 py-1.5 text-xs text-slate-600 dark:border-white/10 dark:text-slate-300">{side.note}</div>
      <div className="glass-dark flex min-h-[140px] flex-1 flex-col font-mono text-xs">
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {lines.map((l, i) => (
            <div key={i} className={l.tone === 'cmd' ? 'text-sky-300' : l.tone === 'error' || l.tone === 'red' ? 'text-rose-300' : l.tone === 'hint' ? 'text-amber-200' : l.tone === 'green' ? 'text-emerald-300' : 'text-slate-200'}>
              {l.text || ' '}
            </div>
          ))}
          <div ref={bottom} />
        </div>
        <form
          className="flex gap-2 border-t border-white/10 px-3 py-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) run(world, input.trim());
            setInput('');
          }}
        >
          <span className="text-emerald-300">$</span>
          <input value={input} onChange={(e) => setInput(e.target.value)} className="min-w-0 flex-1 bg-transparent text-slate-100 outline-none" placeholder="自由にコマンドも打てます" aria-label={`${side.label} のターミナル`} />
        </form>
      </div>
    </div>
  );
}

export function ComparePage({ id }: { id?: string }) {
  const preset = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-3 p-3 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <a href={href.home()} className="text-sm text-slate-500 hover:underline">
          ← ホーム
        </a>
        <h1 className="text-xl font-bold">比較ビュー</h1>
      </div>
      <nav className="flex flex-wrap gap-1.5 text-sm">
        {PRESETS.map((p) => (
          <a key={p.id} href={href.compare(p.id)} className={`glass-btn px-3 py-1 ${p.id === preset.id ? 'bg-sky-500/80! font-bold text-white' : ''}`}>
            {p.title}
          </a>
        ))}
      </nav>
      <p className="text-sm text-slate-600 dark:text-slate-300">{preset.summary}</p>
      <div key={preset.id} className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <Column preset={preset} side={preset.left} testid="compare-left" />
        <Column preset={preset} side={preset.right} testid="compare-right" />
      </div>
    </div>
  );
}
