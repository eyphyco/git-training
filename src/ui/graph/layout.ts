// コミットグラフのレイアウト計算（列 = 時間順、行 = レーン）。描画とは分けてテストする。
import { getCommit, peel } from '../../engine/model/objects';
import { currentBranch, headOid } from '../../engine/model/refs';
import type { Oid, RepoState } from '../../engine/model/types';

export type Label = { key: string; text: string; kind: 'head' | 'branch' | 'remote' | 'tag'; current?: boolean; detached?: boolean };
export type Node = { oid: Oid; col: number; lane: number; message: string; parents: Oid[]; labels: Label[]; isMerge: boolean };
export type Edge = { from: Oid; to: Oid; fromCol: number; fromLane: number; toCol: number; toLane: number; firstParent: boolean };
export type Layout = { nodes: Node[]; edges: Edge[]; lanes: number; cols: number; byOid: Record<Oid, Node> };

export function tips(repo: RepoState): { name: string; oid: Oid; kind: Label['kind'] }[] {
  const out: { name: string; oid: Oid; kind: Label['kind'] }[] = [];
  const cur = currentBranch(repo);
  // 今のブランチ → main/master → その他 の順に優先してレーンを割り当てる
  const heads = Object.entries(repo.refs.heads).sort(([a], [b]) => {
    const rank = (n: string) => (n === 'main' || n === 'master' ? 0 : n === cur ? 1 : 2);
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  for (const [name, oid] of heads) out.push({ name, oid, kind: 'branch' });
  for (const [r, refs] of Object.entries(repo.refs.remotes)) for (const [b, oid] of Object.entries(refs)) out.push({ name: `${r}/${b}`, oid, kind: 'remote' });
  for (const [t, oid] of Object.entries(repo.refs.tags)) out.push({ name: t, oid: peel(repo, oid), kind: 'tag' });
  return out;
}

/** extraTips：ラベルはないが描いておきたいコミット（実行プレビューで「消える」コミットを薄く残す） */
export function layoutGraph(repo: RepoState, extraTips: Oid[] = []): Layout {
  const head = headOid(repo);
  const roots = tips(repo);
  const starts = [...roots.map((t) => t.oid), ...(head ? [head] : []), ...extraTips.filter((o) => repo.objects[o])];

  // 到達できるコミットを集める
  const all = new Set<Oid>();
  const stack = [...starts];
  while (stack.length) {
    const o = stack.pop()!;
    if (all.has(o)) continue;
    all.add(o);
    stack.push(...getCommit(repo, o).parents);
  }

  // 列：親が必ず左に来るよう、時刻順のトポロジカルソート
  const time = (o: Oid) => getCommit(repo, o).committer.time;
  const children = new Map<Oid, Oid[]>();
  const pending = new Map<Oid, number>();
  for (const o of all) {
    const ps = getCommit(repo, o).parents.filter((p) => all.has(p));
    pending.set(o, ps.length);
    for (const p of ps) children.set(p, [...(children.get(p) ?? []), o]);
  }
  const ready = [...all].filter((o) => pending.get(o) === 0);
  const order: Oid[] = [];
  while (ready.length) {
    ready.sort((a, b) => time(a) - time(b) || a.localeCompare(b));
    const o = ready.shift()!;
    order.push(o);
    for (const c of children.get(o) ?? []) {
      pending.set(c, pending.get(c)! - 1);
      if (pending.get(c) === 0) ready.push(c);
    }
  }
  const col = new Map(order.map((o, i) => [o, i]));

  // レーン：ブランチの先端から第1親をたどり、まだ割り当てのないコミットにそのブランチのレーンを付ける
  const lane = new Map<Oid, number>();
  let lanes = 0;
  const claim = (start: Oid) => {
    let o: Oid | undefined = start;
    let used = false;
    while (o && !lane.has(o)) {
      lane.set(o, lanes);
      used = true;
      o = getCommit(repo, o).parents[0];
    }
    if (used) lanes++;
  };
  for (const t of roots) claim(t.oid);
  if (head) claim(head);
  for (const o of extraTips) if (repo.objects[o]) claim(o);
  // ブランチを消した後のマージ元など、まだレーンのないコミット
  for (const o of [...order].reverse()) if (!lane.has(o)) claim(o);

  const labels = new Map<Oid, Label[]>();
  const push = (o: Oid, l: Label) => labels.set(o, [...(labels.get(o) ?? []), l]);
  const cur = currentBranch(repo);
  for (const t of roots) {
    if (t.kind === 'branch' && t.name === cur) push(t.oid, { key: 'HEAD', text: 'HEAD', kind: 'head' });
    push(t.oid, { key: `${t.kind}:${t.name}`, text: t.kind === 'tag' ? `🏷 ${t.name}` : t.name, kind: t.kind, current: t.name === cur });
  }
  if (repo.head.type === 'detached') {
    const list = labels.get(repo.head.oid) ?? [];
    labels.set(repo.head.oid, [{ key: 'HEAD', text: 'HEAD', kind: 'head', detached: true }, ...list]);
  }

  const nodes: Node[] = order.map((o) => {
    const c = getCommit(repo, o);
    return { oid: o, col: col.get(o)!, lane: lane.get(o)!, message: c.message, parents: c.parents, labels: labels.get(o) ?? [], isMerge: c.parents.length > 1 };
  });
  const byOid = Object.fromEntries(nodes.map((n) => [n.oid, n]));
  const edges: Edge[] = nodes.flatMap((n) =>
    n.parents.filter((p) => byOid[p]).map((p, i) => ({ from: p, to: n.oid, fromCol: byOid[p].col, fromLane: byOid[p].lane, toCol: n.col, toLane: n.lane, firstParent: i === 0 })),
  );
  return { nodes, edges, lanes: Math.max(lanes, 1), cols: order.length, byOid };
}
