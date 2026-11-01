// コミットグラフ（F-04）とホバー解説（F-18）。SVG を自前で描き、ラベルは動いて見えるようアニメーションする。
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef } from 'react';
import { commitFiles, getCommit, short } from '../../engine/model/objects';
import { ancestors, currentBranch, headOid } from '../../engine/model/refs';
import type { Oid, RepoState } from '../../engine/model/types';
import { useAnim } from '../anim';
import { Explain } from '../Explain';
import { layoutGraph, tips, type Label, type Layout } from './layout';

const COL = 64;
const LANE = 84;
const PAD_X = 36;
const TOP = 74;
const R = 11;
const PILL_H = 18;

// レーンの色（色だけに頼らないよう、ブランチ名のラベルも必ず出す）
const LANE_COLORS = ['#0284c7', '#db2777', '#16a34a', '#ea580c', '#7c3aed', '#0d9488', '#ca8a04'];
const laneColor = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length];

const nx = (col: number) => PAD_X + col * COL;
const ny = (lane: number) => TOP + lane * LANE;

function edgePath(x1: number, y1: number, x2: number, y2: number, firstParent: boolean) {
  if (y1 === y2) return `M${x1},${y1} L${x2},${y2}`;
  if (firstParent) return `M${x1},${y1} C${x1 + COL / 2},${y1} ${x1 + COL / 2},${y2} ${x1 + COL},${y2} L${x2},${y2}`;
  return `M${x1},${y1} L${x2 - COL},${y1} C${x2 - COL / 2},${y1} ${x2 - COL / 2},${y2} ${x2},${y2}`;
}

function CommitCard({ repo, oid }: { repo: RepoState; oid: Oid }) {
  const c = getCommit(repo, oid);
  const parentFiles = commitFiles(repo, c.parents[0] ?? null);
  const files = commitFiles(repo, oid);
  const changed = [...new Set([...Object.keys(parentFiles), ...Object.keys(files)])].filter((p) => parentFiles[p] !== files[p]).sort();
  const reachable = Object.entries(repo.refs.heads)
    .filter(([, tip]) => ancestors(repo, tip).has(oid))
    .map(([b]) => b);
  return (
    <div className="space-y-1.5">
      <div className="font-mono text-xs text-slate-500">
        <span className="font-bold text-amber-600 dark:text-amber-400">{short(oid)}</span> {oid.slice(7)}
      </div>
      <div className="font-bold whitespace-pre-wrap">{c.message}</div>
      <div className="text-xs">
        親: {c.parents.length ? c.parents.map(short).join(', ') : 'なし（最初のコミット）'}
        {c.parents.length > 1 && <span className="ml-1 rounded bg-violet-100 px-1 text-violet-800 dark:bg-violet-900 dark:text-violet-200">マージコミット</span>}
      </div>
      <div className="text-xs">
        変更: {changed.length ? changed.map((p) => `${p}${!parentFiles[p] ? '（追加）' : !files[p] ? '（削除）' : ''}`).join(', ') : 'なし'}
      </div>
      <div className="text-xs">辿れるブランチ: {reachable.length ? reachable.join(', ') : 'なし（どのブランチからも辿れません）'}</div>
    </div>
  );
}

function LabelCard({ repo, label, oid }: { repo: RepoState; label: Label; oid: Oid }) {
  const msg = getCommit(repo, oid).message.split('\n')[0];
  if (label.kind === 'head') {
    return label.detached ? (
      <div>
        <div className="mb-1 font-bold text-orange-600">HEAD（detached）</div>
        HEAD がブランチを経由せず、コミット <b className="font-mono">{short(oid)}</b> を直接指しています。ここでコミットしてもどのブランチも進みません。戻るには <code>git switch &lt;ブランチ&gt;</code>。
      </div>
    ) : (
      <div>
        <div className="mb-1 font-bold">HEAD → {currentBranch(repo)}</div>
        今いるのは <b>{currentBranch(repo)}</b> ブランチです。コミットすると {currentBranch(repo)} の名札が新しいコミットへ進み、HEAD もついていきます。
      </div>
    );
  }
  return (
    <div>
      <div className="mb-1 font-bold">
        {label.kind === 'remote' ? 'リモート追跡ブランチ' : 'ブランチ'} {label.text}
      </div>
      <div>
        <span className="font-mono">{short(oid)}</span> {msg} を指しています。
      </div>
      {label.current && <div className="mt-1 text-xs text-sky-700 dark:text-sky-300">HEAD が指している今のブランチです。</div>}
    </div>
  );
}

type Props = {
  repo: RepoState;
  highlight?: Oid[];
  compact?: boolean;
  /** 実行プレビュー（F-20）：repo は実行後の状態、base は今の状態 */
  previewBase?: RepoState;
};

function reachable(repo: RepoState): Set<Oid> {
  const out = new Set<Oid>();
  const h = headOid(repo);
  for (const t of [...tips(repo).map((x) => x.oid), ...(h ? [h] : [])]) for (const o of ancestors(repo, t)) out.add(o);
  return out;
}

export function Graph({ repo, highlight = [], compact, previewBase }: Props) {
  const { move, d } = useAnim();
  const layout: Layout | null = useMemo(() => {
    if (!repo.initialized) return null;
    if (!previewBase) return layoutGraph(repo);
    const h = headOid(previewBase);
    return layoutGraph(repo, [...tips(previewBase).map((t) => t.oid), ...(h ? [h] : [])]);
  }, [repo, previewBase]);
  // プレビューで新しくできるコミットと、どこからも辿れなくなるコミット
  const ghost = useMemo(() => {
    if (!previewBase || !layout) return null;
    const now = reachable(repo);
    return { added: new Set(layout.nodes.filter((n) => !previewBase.objects[n.oid]).map((n) => n.oid)), lost: new Set(layout.nodes.filter((n) => !now.has(n.oid)).map((n) => n.oid)) };
  }, [repo, previewBase, layout]);
  const scroller = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  useEffect(() => {
    const el = scroller.current;
    // 新しいコミットは右に増えるので、右端を見せる（お手本表示では左から見せる）
    if (el && !compact) el.scrollTo({ left: el.scrollWidth, behavior: d(1) ? 'smooth' : 'auto' });
  }, [layout?.cols]);

  if (!repo.initialized)
    return <div className="flex h-full items-center justify-center p-4 text-sm text-slate-500">ここはまだ Git リポジトリではありません（<code className="mx-1">git init</code> で作成）</div>;
  if (!layout || !layout.nodes.length) {
    const b = repo.head.type === 'symbolic' ? repo.head.ref : '';
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-sm text-slate-500">
        <div>
          <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-white">HEAD</span> → <span className="rounded border border-dashed border-sky-500 px-2 py-0.5 font-mono text-xs">{b}</span>
        </div>
        <div>まだコミットがありません。{b} ブランチは最初のコミットで生まれます。</div>
      </div>
    );
  }

  const width = PAD_X * 2 + (layout.cols - 1) * COL + (compact ? 40 : 120);
  const height = TOP + (layout.lanes - 1) * LANE + 34;
  // ラベルは位置を key で追いかけてアニメーションさせるため、ノードとは別に並べる
  // HEAD を一番上にして「HEAD → main」の順に積む（i = 0 がノードに一番近い）
  const labels = layout.nodes.flatMap((n) => n.labels.map((l, i) => ({ l, i: n.labels.length - 1 - i, n })));

  return (
    <div ref={scroller} className={`h-full w-full overflow-auto ${compact ? '' : 'p-1'}`}>
      <svg width={width} height={height} role="img" aria-label="コミットグラフ" className="select-none">
        {layout.edges.map((e) => (
          <motion.path
            opacity={ghost && (ghost.added.has(e.from) || ghost.lost.has(e.from)) ? 0.35 : 1}
            strokeDasharray={ghost?.added.has(e.from) ? '5 4' : undefined}
            key={`${e.from}-${e.to}`}
            d={edgePath(nx(e.fromCol), ny(e.fromLane), nx(e.toCol), ny(e.toLane), e.firstParent)}
            fill="none"
            stroke={laneColor(e.firstParent ? e.toLane : e.fromLane)}
            strokeWidth={2.5}
            initial={mounted.current ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={{ duration: d(0.4) }}
          />
        ))}
        {layout.nodes.map((n) => {
          const isNew = highlight.includes(n.oid);
          const added = ghost?.added.has(n.oid);
          const lost = ghost?.lost.has(n.oid);
          return (
            <Explain key={n.oid} asChild side="bottom" content={<CommitCard repo={repo} oid={n.oid} />}>
              <motion.g
                style={{ originX: `${nx(n.col)}px`, originY: `${ny(n.lane)}px`, cursor: 'help' }}
                initial={mounted.current ? { scale: 0, opacity: 0 } : false}
                animate={{ scale: 1, opacity: added ? 0.55 : lost ? 0.22 : 1 }}
                data-preview={added ? 'added' : lost ? 'lost' : undefined}
                transition={move}
                data-testid={`commit-${short(n.oid)}`}
              >
                {isNew && (
                  <motion.circle cx={nx(n.col)} cy={ny(n.lane)} r={R} fill="none" stroke={laneColor(n.lane)} initial={{ r: R, opacity: 0.8 }} animate={{ r: R + 14, opacity: 0 }} transition={{ duration: d(1.2), repeat: 1 }} />
                )}
                <circle cx={nx(n.col)} cy={ny(n.lane)} r={R} fill={n.isMerge || added ? 'white' : laneColor(n.lane)} stroke={laneColor(n.lane)} strokeWidth={n.isMerge ? 4 : 2} strokeDasharray={added ? '4 3' : undefined} />
                {lost && (
                  <text x={nx(n.col)} y={ny(n.lane) + 4} textAnchor="middle" className="fill-rose-600 text-[12px] font-bold">
                    ×
                  </text>
                )}
                <text x={nx(n.col)} y={ny(n.lane) + R + 14} textAnchor="middle" className="fill-slate-500 font-mono text-[10px]">
                  {short(n.oid)}
                </text>
              </motion.g>
            </Explain>
          );
        })}
        {labels.map(({ l, i, n }) => {
          const text = l.text;
          const w = text.length * 7 + 14;
          // 左端のコミットの長いラベル（origin/main など）が SVG の外にはみ出さないようにする
          const x = Math.max(2, nx(n.col) - w / 2);
          const y = ny(n.lane) - R - 6 - PILL_H - i * (PILL_H + 3);
          const style =
            l.kind === 'head'
              ? { fill: l.detached ? '#ea580c' : '#1e293b', stroke: 'none', text: 'white' }
              : l.kind === 'remote'
                ? { fill: 'transparent', stroke: '#64748b', text: '#64748b' }
                : { fill: l.current ? laneColor(n.lane) : 'white', stroke: laneColor(n.lane), text: l.current ? 'white' : laneColor(n.lane) };
          return (
            <Explain key={l.key} asChild side="top" content={<LabelCard repo={repo} label={l} oid={n.oid} />}>
              <motion.g initial={false} animate={{ x, y }} transition={move} style={{ cursor: 'help' }} data-testid={`label-${l.key}`}>
                <rect width={w} height={PILL_H} rx={9} fill={style.fill} stroke={style.stroke} strokeWidth={1.5} strokeDasharray={l.kind === 'remote' ? '3 2' : undefined} />
                <text x={w / 2} y={13} textAnchor="middle" fill={style.text} className="font-mono text-[11px] font-bold">
                  {text}
                </text>
              </motion.g>
            </Explain>
          );
        })}
      </svg>
    </div>
  );
}
