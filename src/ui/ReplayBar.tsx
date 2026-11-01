// 操作の再生（F-22）。スライダーで過去の状態に戻して、グラフの変化を見直す（表示だけで、状態は変えない）。
import { useEffect, useState } from 'react';
import type { Frame } from '../lesson/session';
import { useAnim } from './anim';

type Props = { timeline: Frame[]; index: number | null; onChange(index: number | null): void };

export function ReplayBar({ timeline, index, onChange }: Props) {
  const { speed } = useAnim();
  const [playing, setPlaying] = useState(false);
  const last = timeline.length - 1;
  const at = index ?? last;

  // 再生中は 1 コマずつ進め、最後まで来たら今の状態に戻る
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (at + 1 >= last) {
        setPlaying(false);
        onChange(null);
      } else onChange(at + 1);
    }, speed === 0 ? 300 : 1100 / speed);
    return () => clearTimeout(t);
  }, [playing, at, last, onChange, speed]);

  if (timeline.length < 2) return null;
  return (
    <div className="flex items-center gap-2 border-b border-white/40 px-3 py-1 text-xs dark:border-white/10" data-testid="replay">
      <button
        type="button"
        className="glass-btn px-2 py-0.5"
        onClick={() => {
          if (playing) return setPlaying(false);
          onChange(0);
          setPlaying(true);
        }}
        title="操作を最初から再生"
      >
        {playing ? '⏸ 停止' : '▶ 再生'}
      </button>
      <input
        type="range"
        min={0}
        max={last}
        value={at}
        onChange={(e) => {
          setPlaying(false);
          const v = Number(e.target.value);
          onChange(v === last ? null : v);
        }}
        className="min-w-0 flex-1 accent-sky-500"
        aria-label="操作の再生位置"
      />
      <span className="w-48 truncate font-mono text-slate-600 dark:text-slate-300" title={timeline[at].label}>
        {at}/{last} {timeline[at].label}
      </span>
      {index !== null && (
        <button
          type="button"
          className="glass-btn px-2 py-0.5"
          onClick={() => {
            setPlaying(false);
            onChange(null);
          }}
        >
          今に戻る
        </button>
      )}
    </div>
  );
}
