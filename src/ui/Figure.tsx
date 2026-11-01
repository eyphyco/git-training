// 動く図解（F-21）。ステップ送り・自動再生で、エンジンの状態をグラフと4エリアで見せる。
import { useEffect, useMemo, useState } from 'react';
import { buildFrames, figures } from '../lesson/figures';
import { useAnim } from './anim';
import { AreaView } from './AreaView';
import { Graph } from './graph/Graph';

export function Figure({ id }: { id: string }) {
  const fig = figures[id];
  const frames = useMemo(() => (fig ? buildFrames(fig) : []), [fig]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const { speed } = useAnim();

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (i + 1 >= frames.length) setPlaying(false);
      else setI(i + 1);
    }, speed === 0 ? 1500 : 2200 / speed);
    return () => clearTimeout(t);
  }, [playing, i, frames.length, speed]);

  if (!fig) return <div className="text-xs text-rose-500">図「{id}」が見つかりません</div>;
  const frame = frames[i];
  const show = fig.show ?? ['graph'];
  const prev = i > 0 ? frames[i - 1].world.local : null;
  return (
    <figure className="not-prose my-3 overflow-hidden rounded-xl border border-white/60 bg-white/40 backdrop-blur-md dark:border-white/10 dark:bg-white/5" data-testid={`figure-${id}`}>
      <figcaption className="flex items-center gap-2 border-b border-white/50 px-3 py-1.5 text-xs dark:border-white/10">
        <span className="font-bold">▶ 図解：{fig.title}</span>
        <span className="ml-auto text-slate-500">
          {i}/{frames.length - 1}
        </span>
      </figcaption>
      {show.includes('graph') && (
        <div className="h-52">
          <Graph repo={frame.world.local} compact />
        </div>
      )}
      {show.includes('areas') && (
        <div className="h-44 border-t border-white/40 text-[11px] dark:border-white/10">
          <AreaView repo={frame.world.local} remote={frame.world.local.config.remotes?.origin ? frame.world.remotes.origin : undefined} prev={prev} events={[]} seq={i} onCommand={() => {}} onOpenFile={() => {}} />
        </div>
      )}
      <div className="space-y-1 border-t border-white/50 px-3 py-2 text-sm dark:border-white/10">
        {frame.command && <code className="block font-mono text-xs text-sky-700 dark:text-sky-300">$ {frame.command}</code>}
        <p className="leading-relaxed">{frame.caption}</p>
        <div className="flex items-center gap-1.5 pt-1">
          <button type="button" className="glass-btn px-2 py-0.5 text-xs" onClick={() => (setPlaying(false), setI(0))} disabled={i === 0}>
            ⏮
          </button>
          <button type="button" className="glass-btn px-2 py-0.5 text-xs" onClick={() => (setPlaying(false), setI(i - 1))} disabled={i === 0}>
            ◀ 戻る
          </button>
          <button type="button" className="glass-btn px-2 py-0.5 text-xs font-bold" onClick={() => (setPlaying(false), setI(i + 1))} disabled={i >= frames.length - 1} data-testid="figure-next">
            次へ ▶
          </button>
          <button
            type="button"
            className="glass-btn px-2 py-0.5 text-xs"
            onClick={() => {
              if (playing) return setPlaying(false);
              if (i >= frames.length - 1) setI(0);
              setPlaying(true);
            }}
          >
            {playing ? '⏸ 停止' : '⏯ 自動再生'}
          </button>
          <span className="ml-auto flex gap-1">
            {frames.map((_, k) => (
              <span key={k} className={`h-1.5 w-1.5 rounded-full ${k === i ? 'bg-sky-500' : 'bg-slate-400/40'}`} />
            ))}
          </span>
        </div>
      </div>
    </figure>
  );
}
