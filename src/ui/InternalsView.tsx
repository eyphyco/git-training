// 内部構造ビュー（F-15）：.git フォルダ風の一覧と、commit → tree → blob をたどれるオブジェクトの中身。
import { useState } from 'react';
import { prettyObject } from '../engine/commands/plumbing';
import { short } from '../engine/model/objects';
import { currentBranch, headOid } from '../engine/model/refs';
import type { Oid, RepoState } from '../engine/model/types';
import { cwdOf, worktreePaths } from '../engine/worktrees';
import { Term } from './glossary';

type Node = { name: string; detail?: string; oid?: Oid; children?: Node[]; text?: string };

function gitTree(repo: RepoState): Node[] {
  const ref = (name: string, oid: Oid) => ({ name, detail: short(oid), oid, text: oid });
  const byType = (t: string) => Object.entries(repo.objects).filter(([, o]) => o.type === t);
  const remotes = Object.entries(repo.refs.remotes);
  return [
    { name: 'HEAD', detail: repo.head.type === 'symbolic' ? `ref: refs/heads/${repo.head.ref}` : short(repo.head.oid), oid: headOid(repo) ?? undefined, text: repo.head.type === 'symbolic' ? `ref: refs/heads/${repo.head.ref}` : repo.head.oid },
    {
      name: 'refs/',
      children: [
        { name: 'heads/', children: Object.entries(repo.refs.heads).sort().map(([b, o]) => ref(b, o)) },
        ...(Object.keys(repo.refs.tags).length ? [{ name: 'tags/', children: Object.entries(repo.refs.tags).sort().map(([t, o]) => ref(t, o)) }] : []),
        ...(remotes.length ? [{ name: 'remotes/', children: remotes.map(([r, refs]) => ({ name: `${r}/`, children: Object.entries(refs).sort().map(([b, o]) => ref(b, o)) })) }] : []),
        ...(repo.stash.length ? [ref('stash', repo.stash[0].oid)] : []),
      ],
    },
    { name: 'logs/HEAD', detail: `${repo.reflog.filter((e) => e.ref === 'HEAD').length} 行（reflog）` },
    {
      name: 'objects/',
      detail: `${Object.keys(repo.objects).length} 個`,
      children: (['commit', 'tree', 'blob', 'tag'] as const)
        .map((t) => ({ t, list: byType(t) }))
        .filter((x) => x.list.length)
        .map(({ t, list }) => ({ name: `${t}（${list.length}）`, children: list.map(([o]) => ({ name: `${o.slice(0, 2)}/${o.slice(2, 10)}…`, oid: o })) })),
    },
    { name: 'index', detail: `${Object.keys(repo.index).length} ファイル（ステージ）`, children: Object.entries(repo.index).sort().map(([p, o]) => ({ name: p, detail: short(o), oid: o })) },
    ...(repo.hooks && Object.keys(repo.hooks).length ? [{ name: 'hooks/', children: Object.entries(repo.hooks).map(([n, t]) => ({ name: n, text: t })) }] : []),
    ...(repo.worktrees && Object.keys(repo.worktrees.others).length ? [{ name: 'worktrees/', children: worktreePaths(repo).map((p) => ({ name: p.split('/').pop()!, detail: p === cwdOf(repo) ? `${p}（今ここ）` : p })) }] : []),
  ];
}

function TreeList({ nodes, onPick, depth = 0 }: { nodes: Node[]; onPick(n: Node): void; depth?: number }) {
  return (
    <ul className={depth ? 'ml-3 border-l border-[var(--line)] pl-2' : ''}>
      {nodes.map((n, i) => (
        <li key={`${n.name}-${i}`}>
          {n.children ? (
            <details open={depth < 1}>
              <summary className="cursor-pointer font-mono text-xs">
                📁 {n.name} {n.detail && <span className="text-[var(--muted)]">{n.detail}</span>}
              </summary>
              <TreeList nodes={n.children} onPick={onPick} depth={depth + 1} />
            </details>
          ) : (
            <button type="button" className="block w-full truncate rounded px-1 text-left font-mono text-xs hover:bg-[var(--accent-soft)]" onClick={() => onPick(n)}>
              📄 {n.name} {n.detail && <span className="text-[var(--muted)]">{n.detail}</span>}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function InternalsView({ repo, inspect, onInspect }: { repo: RepoState; inspect: Oid | null; onInspect(oid: Oid | null): void }) {
  const [text, setText] = useState<{ title: string; body: string } | null>(null);
  if (!repo.initialized) return <div className="p-4 text-sm text-[var(--muted)]">git init すると .git フォルダができます。</div>;
  const obj = inspect ? repo.objects[inspect] : undefined;
  const lines = inspect && obj ? prettyObject(repo, inspect) : [];
  // 中身の 40 桁の ID はクリックしてたどれる
  const linkify = (l: string) =>
    l.split(/([0-9a-f]{40})/).map((part, i) =>
      /^[0-9a-f]{40}$/.test(part) && repo.objects[part] ? (
        <button key={i} type="button" className="text-[var(--accent)] underline decoration-dotted" onClick={() => onInspect(part)} title="クリックで中身を見る">
          {part}
        </button>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(160px,0.8fr)_1.2fr]" data-testid="internals">
      <div className="min-h-0 overflow-y-auto border-r border-[var(--line)] p-2">
        <div className="mb-1 text-xs font-bold">.git/</div>
        <TreeList
          nodes={gitTree(repo)}
          onPick={(n) => {
            if (n.oid && repo.objects[n.oid]) {
              setText(null);
              onInspect(n.oid);
            } else if (n.text !== undefined) {
              onInspect(null);
              setText({ title: n.name, body: n.text });
            }
          }}
        />
      </div>
      <div className="min-h-0 overflow-y-auto p-3">
        {obj && inspect ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2 font-bold text-[var(--accent)]">
                <Term id={obj.type === 'commit' ? 'commit' : 'hash'}>{obj.type}</Term>
              </span>
              <code className="break-all">{inspect}</code>
            </div>
            <div className="text-xs text-[var(--muted)]">
              {obj.type === 'commit' && 'コミット：tree（その時点の全ファイル）・親・作者・メッセージを持つ。ID はこの中身の SHA-1。'}
              {obj.type === 'tree' && 'ツリー：フォルダ1つ分。ファイル名と blob（中身）や下のフォルダ（tree）の ID の一覧。'}
              {obj.type === 'blob' && 'ブロブ：ファイルの中身だけ（ファイル名は持たない）。同じ内容なら同じ ID になり、1つだけ保存される。'}
              {obj.type === 'tag' && '注釈付きタグ：指すコミット・タグ名・作成者・メッセージを持つ。'}
            </div>
            <pre className="paper overflow-x-auto rounded-xl border border-[var(--line)] p-3 font-mono text-xs leading-5">
              {lines.map((l, i) => (
                <div key={i}>{linkify(l) }</div>
              ))}
            </pre>
            <div className="text-xs text-[var(--muted)]">
              ターミナルでは <code>git cat-file -p {short(inspect)}</code> で同じものが見られます。
            </div>
          </div>
        ) : text ? (
          <div className="space-y-2">
            <div className="font-mono text-xs font-bold">{text.title}</div>
            <pre className="paper overflow-x-auto rounded-xl border border-[var(--line)] p-3 font-mono text-xs whitespace-pre-wrap">{text.body}</pre>
          </div>
        ) : (
          <div className="text-sm text-[var(--muted)]">
            左の一覧か、グラフのコミットをクリックすると中身を表示します。今は {currentBranch(repo) ?? 'detached HEAD'} にいます。
          </div>
        )}
      </div>
    </div>
  );
}
