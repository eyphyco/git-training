// ref の解決と移動、コミットグラフの探索。
import { getCommit, peel } from './objects';
import type { Oid, RepoState } from './types';

export function currentBranch(repo: RepoState): string | null {
  return repo.head.type === 'symbolic' ? repo.head.ref : null;
}

export function headOid(repo: RepoState): Oid | null {
  return repo.head.type === 'detached' ? repo.head.oid : (repo.refs.heads[repo.head.ref] ?? null);
}

function resolveName(repo: RepoState, name: string): Oid | null {
  if (name === 'HEAD' || name === '@') return headOid(repo);
  const n = name.replace(/^refs\//, '');
  if (n.startsWith('heads/') && repo.refs.heads[n.slice(6)]) return repo.refs.heads[n.slice(6)];
  if (n.startsWith('tags/') && repo.refs.tags[n.slice(5)]) return peel(repo, repo.refs.tags[n.slice(5)]);
  if (repo.refs.heads[n]) return repo.refs.heads[n];
  if (repo.refs.tags[n]) return peel(repo, repo.refs.tags[n]);
  const remotePath = n.startsWith('remotes/') ? n.slice(8) : n;
  const slash = remotePath.indexOf('/');
  if (slash > 0) {
    const remote = repo.refs.remotes[remotePath.slice(0, slash)];
    const oid = remote?.[remotePath.slice(slash + 1)];
    if (oid) return oid;
  }
  if (/^[0-9a-f]{4,40}$/.test(n)) {
    const hits = Object.keys(repo.objects).filter((o) => o.startsWith(n) && repo.objects[o].type === 'commit');
    if (hits.length === 1) return hits[0];
  }
  return null;
}

/** reflog の参照名（HEAD / refs/heads/main / refs/stash） */
export function reflogRef(repo: RepoState, name: string): string | null {
  if (!name || name === 'HEAD' || name === '@') return 'HEAD';
  if (name === 'stash' || name === 'refs/stash') return 'refs/stash';
  const n = name.replace(/^refs\/heads\//, '');
  return repo.refs.heads[n] !== undefined ? `refs/heads/${n}` : null;
}

/** ref の reflog を新しい順に返す */
export function reflogOf(repo: RepoState, ref: string) {
  return repo.reflog.filter((e) => e.ref === ref).reverse();
}

/** "HEAD@{2}" "main@{1}" "stash@{0}" を解決する */
function resolveReflog(repo: RepoState, name: string, n: number): Oid | null {
  if (name === 'stash' || name === 'refs/stash') return repo.stash[n]?.oid ?? null;
  const ref = reflogRef(repo, name);
  if (!ref) return null;
  return reflogOf(repo, ref)[n]?.new ?? null;
}

/** "main", "HEAD~2", "abc1234^2", "HEAD@{1}" などをコミット ID に解決する。解決できなければ null */
export function resolveRev(repo: RepoState, rev: string): Oid | null {
  const m = rev.match(/^(.*?)(?:@\{(\d+)\})?((?:[~^]\d*)*)$/);
  if (!m) return null;
  let oid = m[2] !== undefined ? resolveReflog(repo, m[1], Number(m[2])) : resolveName(repo, m[1] || 'HEAD');
  if (!oid) return null;
  const ops = m[3].match(/[~^]\d*/g) ?? [];
  for (const op of ops) {
    const n = op.length > 1 ? Number(op.slice(1)) : 1;
    if (op[0] === '~') {
      for (let i = 0; i < n && oid; i++) oid = getCommit(repo, oid).parents[0] ?? null;
    } else if (n > 0) {
      oid = getCommit(repo, oid!).parents[n - 1] ?? null;
    }
    if (!oid) return null;
  }
  return oid;
}

export function logRef(repo: RepoState, ref: string, old: Oid | null, next: Oid, message: string, time: number) {
  repo.reflog.push({ ref, old, new: next, message, time });
}

/** ブランチを動かし、HEAD がそのブランチを指していれば HEAD の reflog も残す */
export function setBranch(repo: RepoState, name: string, oid: Oid, message: string, time: number) {
  const old = repo.refs.heads[name] ?? null;
  repo.refs.heads[name] = oid;
  logRef(repo, `refs/heads/${name}`, old, oid, message, time);
  if (currentBranch(repo) === name) logRef(repo, 'HEAD', old, oid, message, time);
}

export function ancestors(repo: RepoState, oid: Oid): Set<Oid> {
  const seen = new Set<Oid>();
  const stack = [oid];
  while (stack.length) {
    const o = stack.pop()!;
    if (seen.has(o)) continue;
    seen.add(o);
    stack.push(...getCommit(repo, o).parents);
  }
  return seen;
}

export function isAncestor(repo: RepoState, maybeAncestor: Oid, of: Oid): boolean {
  return ancestors(repo, of).has(maybeAncestor);
}

/** 共通祖先のうち最も新しいもの（criss-cross は考慮しない簡略版） */
export function mergeBase(repo: RepoState, a: Oid, b: Oid): Oid | null {
  const ancA = ancestors(repo, a);
  const common = [...ancestors(repo, b)].filter((o) => ancA.has(o));
  // 他の共通祖先の祖先になっていないもの = 最良の共通祖先
  const best = common.filter((c) => !common.some((d) => d !== c && isAncestor(repo, c, d)));
  best.sort((x, y) => getCommit(repo, y).committer.time - getCommit(repo, x).committer.time);
  return best[0] ?? null;
}

/** 新しい順（コミット時刻の降順）に履歴をたどる */
export function walkLog(repo: RepoState, starts: Oid[]): Oid[] {
  const seen = new Set<Oid>();
  const queue = [...new Set(starts)];
  const out: Oid[] = [];
  while (queue.length) {
    queue.sort((x, y) => getCommit(repo, y).committer.time - getCommit(repo, x).committer.time);
    const o = queue.shift()!;
    if (seen.has(o)) continue;
    seen.add(o);
    out.push(o);
    for (const p of getCommit(repo, o).parents) if (!seen.has(p)) queue.push(p);
  }
  return out;
}

export function isValidBranchName(name: string): boolean {
  return (
    name.length > 0 &&
    !/[\s~^:?*[\\]|\.\.|@\{|\/\/|^[-/.]|[/.]$|\.lock$/.test(name) &&
    name !== 'HEAD' &&
    name !== '@'
  );
}
