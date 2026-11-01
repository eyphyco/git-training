// 4エリアビュー（F-03）。add / commit / restore でファイルが隣のエリアへ動いて見える。
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { commitFiles } from '../engine/model/objects';
import { headOid } from '../engine/model/refs';
import type { GitEvent, Path, RepoState } from '../engine/model/types';
import { useAnim } from './anim';
import { computeAreas, motionFor, STATE_INFO, type FileItem, type Motion } from './areas';
import { Explain } from './Explain';
import { Term } from './glossary';

type Props = {
  repo: RepoState;
  prev: RepoState | null;
  events: GitEvent[];
  seq: number;
  onCommand(cmd: string): void;
  onOpenFile(path: Path): void;
};

const quote = (p: string) => (/[\s"'$]/.test(p) ? `"${p}"` : p);

function Chip({ item, area, motionKind, onCommand, onOpenFile }: { item: FileItem; area: 'worktree' | 'index' | 'head'; motionKind: Motion } & Pick<Props, 'onCommand' | 'onOpenFile'>) {
  const { d } = useAnim();
  const info = STATE_INFO[item.state];
  const initial = motionKind === 'from-left' ? { x: -70, opacity: 0 } : motionKind === 'from-right' ? { x: 70, opacity: 0 } : motionKind === 'pop' ? { scale: 0.6, opacity: 0 } : false;
  const actions: { label: string; cmd: string; title: string }[] = [];
  if (area === 'worktree' && ['untracked', 'modified', 'deleted', 'conflict'].includes(item.state)) actions.push({ label: '+ add', cmd: `git add ${quote(item.path)}`, title: 'ステージに載せる' });
  if (area === 'worktree' && ['modified', 'deleted'].includes(item.state)) actions.push({ label: '↶ restore', cmd: `git restore ${quote(item.path)}`, title: '変更を捨てる（取り消せません）' });
  if (area === 'index' && ['added', 'staged', 'removed'].includes(item.state)) actions.push({ label: '↶ unstage', cmd: `git restore --staged ${quote(item.path)}`, title: 'ステージから外す' });
  const changed = item.state !== 'clean';
  return (
    <motion.li
      initial={initial}
      animate={{ x: 0, scale: 1, opacity: 1 }}
      transition={{ duration: d(0.5), ease: 'easeOut' }}
      className="group relative"
    >
      <div className={`flex items-center gap-1 rounded-md border bg-white px-2 py-1 font-mono text-xs dark:bg-slate-900 ${info.cls} ${motionKind && changed ? 'ring-2 ring-amber-300' : ''}`}>
        <Explain asChild content={<div><div className="mb-1 font-mono font-bold">{item.path}</div>{info.text}</div>}>
          <button
            type="button"
            className="min-w-0 flex-1 cursor-pointer truncate text-left"
            onClick={() => area === 'worktree' && item.state !== 'deleted' && onOpenFile(item.path)}
            data-testid={`file-${area}-${item.path}`}
          >
            {item.path}
          </button>
        </Explain>
        {info.badge && <span className="shrink-0 rounded bg-current/10 px-1 text-[10px] font-bold">{info.badge}</span>}
      </div>
      {actions.length > 0 && (
        <div className="mt-0.5 flex gap-1 sm:absolute sm:top-full sm:right-0 sm:z-10 sm:mt-0 sm:hidden sm:group-focus-within:flex sm:group-hover:flex">
          {actions.map((a) => (
            <button key={a.cmd} type="button" title={a.title} onClick={() => onCommand(a.cmd)} className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-white shadow hover:bg-slate-900">
              {a.label}
            </button>
          ))}
        </div>
      )}
    </motion.li>
  );
}

function Column({ title, term, hint, children, dim }: { title: string; term?: string; hint: string; children: React.ReactNode; dim?: boolean }) {
  return (
    <section className={`min-w-0 flex-1 flex-col rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 ${dim ? 'hidden opacity-50 sm:flex' : 'flex'}`}>
      <header className="border-b border-slate-200 px-2 py-1 text-xs font-bold dark:border-slate-800">
        {term ? <Term id={term}>{title}</Term> : title}
        <div className="truncate font-normal text-slate-500">{hint}</div>
      </header>
      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">{children}</ul>
    </section>
  );
}

export function AreaView({ repo, prev, events, seq, onCommand, onOpenFile }: Props) {
  const areas = useMemo(() => computeAreas(repo), [repo]);
  const changed = useMemo(() => {
    const set = new Set<Path>();
    if (!prev) return set;
    const a = prev.initialized ? commitFiles(prev, headOid(prev)) : {};
    const b = commitFiles(repo, headOid(repo));
    for (const p of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[p] !== b[p]) set.add(p);
    for (const p of new Set([...Object.keys(prev.workingTree), ...Object.keys(repo.workingTree)])) if (prev.workingTree[p] !== repo.workingTree[p]) set.add(p);
    return set;
  }, [prev, repo]);
  const chip = (item: FileItem, area: 'worktree' | 'index' | 'head') => {
    const m = motionFor(events, area, item.path, changed);
    // 動いたファイルは key を変えて作り直し、入ってくるアニメーションを再生する
    return <Chip key={m ? `${item.path}:${seq}` : item.path} item={item} area={area} motionKind={m} onCommand={onCommand} onOpenFile={onOpenFile} />;
  };
  const arrow = (label: string) => (
    <div className="hidden shrink-0 flex-col items-center justify-center px-0.5 text-[10px] text-slate-400 sm:flex">
      <span>{label}</span>
      <span className="text-lg leading-none">→</span>
    </div>
  );
  return (
    <div className="flex h-full gap-1 p-2">
      <Column title="ワークツリー" term="working-tree" hint="編集中のファイル（クリックで編集）">
        {areas.worktree.length ? areas.worktree.map((f) => chip(f, 'worktree')) : <li className="text-xs text-slate-400">ファイルなし</li>}
      </Column>
      {arrow('add')}
      <Column title="ステージ" term="staging-area" hint="次のコミットに入る内容">
        {repo.initialized ? areas.index.map((f) => chip(f, 'index')) : <li className="text-xs text-slate-400">git init 前</li>}
      </Column>
      {arrow('commit')}
      <Column title="ローカルリポジトリ" term="repository" hint={areas.headLabel ? `HEAD: ${areas.headLabel}` : 'コミットなし'}>
        {areas.head.map((f) => chip(f, 'head'))}
      </Column>
      {arrow('push')}
      <Column title="リモート" term="remote" hint="第4章で解放" dim>
        <li className="text-xs text-slate-400">origin（第4章）</li>
      </Column>
    </div>
  );
}
