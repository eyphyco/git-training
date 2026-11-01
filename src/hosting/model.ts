// 模擬 GitHub（ホスティング模擬層、設計書 §6）の読み取り専用の計算：PR のコミット・差分・CI・承認・マージ可否。
import { commitFiles, getBlob, getCommit } from '../engine/model/objects';
import { ancestors, mergeBase, walkLog } from '../engine/model/refs';
import type { BranchProtection, CiRule, Oid, Path, PullRequest, RepoState, World } from '../engine/model/types';
import { mergeTrees } from '../engine/merge/tree3';
import { DEFAULT_URL } from '../engine/remote';

export const ORIGIN = 'origin';
const DEFAULT_CI: CiRule[] = [{ name: 'test', description: 'npm test' }];

/** origin の URL から "you/project" を取り出す */
export function repoSlug(world: World): string {
  const url = world.local.config.remotes?.[ORIGIN]?.url ?? DEFAULT_URL;
  const m = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(\.git)?$/);
  return m ? `${m[1]}/${m[2]}` : 'you/project';
}

/** 自分の GitHub ユーザー名（URL のオーナー。チームのリポジトリなら you） */
export const ME = 'you';

export function hosted(world: World): RepoState | null {
  return world.remotes[ORIGIN] ?? null;
}

export function defaultBranch(repo: RepoState): string {
  return repo.head.type === 'symbolic' ? repo.head.ref : 'main';
}

export function findPr(world: World, n?: number): PullRequest | undefined {
  const prs = world.hosting.pullRequests;
  return n === undefined ? prs[prs.length - 1] : prs.find((p) => p.number === n);
}

export function protectionOf(world: World, branch: string): BranchProtection | undefined {
  return world.hosting.protections.find((p) => p.branch === branch);
}

/** PR に含まれるコミット（新しい順） */
export function prCommits(repo: RepoState, pr: PullRequest): Oid[] {
  if (pr.merged && pr.merged.method !== 'merge') return [];
  const head = repo.refs.heads[pr.head] ?? (pr.merged ? getCommit(repo, pr.merged.oid).parents[1] : undefined);
  const base = repo.refs.heads[pr.base];
  if (!head || !base) return [];
  const exclude = pr.merged ? ancestors(repo, getCommit(repo, pr.merged.oid).parents[0]) : ancestors(repo, base);
  return walkLog(repo, [head]).filter((o) => !exclude.has(o));
}

export type FileChange = { path: Path; before: string | null; after: string | null };

/** 「Files changed」：共通祖先から head までの差分 */
export function prFiles(repo: RepoState, pr: PullRequest): FileChange[] {
  const head = repo.refs.heads[pr.head];
  const base = repo.refs.heads[pr.base];
  if (!head || !base) return [];
  const a = commitFiles(repo, mergeBase(repo, base, head));
  const b = commitFiles(repo, head);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((p) => a[p] !== b[p])
    .sort()
    .map((p) => ({ path: p, before: a[p] ? getBlob(repo, a[p]) : null, after: b[p] ? getBlob(repo, b[p]) : null }));
}

export type CheckRun = { name: string; description?: string; ok: boolean; detail: string };

/** 模擬 CI：head のファイルに failIf の文字列があれば失敗 */
export function prChecks(world: World, pr: PullRequest): CheckRun[] {
  const repo = hosted(world);
  const head = repo?.refs.heads[pr.head];
  if (!repo || !head) return [];
  const files = commitFiles(repo, head);
  return (world.hosting.ci ?? DEFAULT_CI).map((rule) => {
    const f = rule.failIf;
    const bad = f && files[f.path] && getBlob(repo, files[f.path]).includes(f.contains);
    return { name: rule.name, description: rule.description, ok: !bad, detail: bad ? `${f!.path} に「${f!.contains}」が残っています` : 'Successful' };
  });
}

/** CODEOWNERS（.github/CODEOWNERS か CODEOWNERS）を base ブランチから読み、変更ファイルの担当者を返す */
export function codeOwners(repo: RepoState, pr: PullRequest): string[] {
  const base = repo.refs.heads[pr.base];
  if (!base) return [];
  const files = commitFiles(repo, base);
  const oid = files['.github/CODEOWNERS'] ?? files.CODEOWNERS;
  if (!oid) return [];
  const rules = getBlob(repo, oid)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [pattern, ...owners] = l.split(/\s+/);
      return { pattern, owners: owners.map((o) => o.replace(/^@/, '')) };
    });
  const owners = new Set<string>();
  for (const f of prFiles(repo, pr)) {
    // 後に書いた規則が優先（GitHub と同じ）
    const hit = [...rules].reverse().find((r) => matchOwner(r.pattern, f.path));
    for (const o of hit?.owners ?? []) owners.add(o);
  }
  return [...owners].sort();
}

function matchOwner(pattern: string, path: Path): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('/')) return `/${path}`.startsWith(pattern.startsWith('/') ? pattern : `/${pattern}`) || path.includes(`/${pattern}`) || path.startsWith(pattern);
  if (pattern.startsWith('*.')) return path.endsWith(pattern.slice(1));
  return path === pattern.replace(/^\//, '');
}

/** レビュアーごとの最新のレビュー */
export function latestReviews(pr: PullRequest) {
  const by = new Map<string, PullRequest['reviews'][number]>();
  for (const r of pr.reviews) if (r.state !== 'commented') by.set(r.author, r);
  return [...by.values()];
}

/** マージを止めている理由（空ならマージできる） */
export function mergeBlockers(world: World, pr: PullRequest): string[] {
  const repo = hosted(world);
  if (pr.state !== 'open') return [`この PR は ${pr.state === 'merged' ? 'マージ済み' : 'クローズ済み'}です`];
  if (!repo?.refs.heads[pr.head]) return [`ブランチ ${pr.head} が GitHub 上にありません`];
  const out: string[] = [];
  if (pr.draft) out.push('Draft の PR はマージできません（Ready for review にしてください）');
  if (hasConflicts(repo, pr)) out.push('This branch has conflicts that must be resolved（コンフリクトがあります）');
  const prot = protectionOf(world, pr.base);
  const reviews = latestReviews(pr);
  const approvals = reviews.filter((r) => r.state === 'approved');
  if (prot?.requiredApprovals) {
    if (reviews.some((r) => r.state === 'changes_requested')) out.push('Changes requested（修正を求めるレビューが残っています）');
    if (approvals.length < prot.requiredApprovals) out.push(`Review required（承認が ${prot.requiredApprovals} 件必要です。今は ${approvals.length} 件）`);
  }
  if (prot?.requireCodeOwnerReviews) {
    const owners = codeOwners(repo, pr).filter((o) => o !== pr.author);
    if (owners.length && !approvals.some((r) => owners.includes(r.author))) out.push(`Code owner review required（${owners.map((o) => `@${o}`).join(', ')} の承認が必要です）`);
  }
  if (prot?.requireStatusChecks && prChecks(world, pr).some((c) => !c.ok)) out.push('Required status check "test" is failing（CI が失敗しています）');
  return out;
}

export function hasConflicts(repo: RepoState, pr: PullRequest): boolean {
  const head = repo.refs.heads[pr.head];
  const base = repo.refs.heads[pr.base];
  if (!head || !base) return false;
  return mergeTrees(repo, commitFiles(repo, mergeBase(repo, base, head)), commitFiles(repo, base), commitFiles(repo, head), { ours: pr.base, theirs: pr.head }, false).conflicts.length > 0;
}

/** PR 本文の "Closes #12" "Fixes #3" などで閉じる Issue */
export function linkedIssues(pr: PullRequest): number[] {
  return [...pr.body.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi)].map((m) => Number(m[1]));
}
