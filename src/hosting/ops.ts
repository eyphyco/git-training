// 模擬 GitHub の操作（PR の作成・レビュー・マージ、ブランチ保護）。gh コマンドと GitHub 画面の両方から呼ぶ。
import type { Draft } from 'immer';
import { fail, type Ctx } from '../engine/command';
import { mergeTrees } from '../engine/merge/tree3';
import { commitFiles, getCommit, subject, writeCommit, writeTree } from '../engine/model/objects';
import { mergeBase } from '../engine/model/refs';
import type { BranchProtection, MergeMethod, PullRequest, RepoState, Review, Signature, World } from '../engine/model/types';
import { defaultBranch, findPr, linkedIssues, ME, mergeBlockers, prCommits, protectionOf, repoSlug } from './model';

export function hostedOrFail(ctx: Ctx): Draft<RepoState> {
  const repo = ctx.world.remotes.origin;
  if (!repo) fail('no git remotes found', 'まだ GitHub のリポジトリ（origin）がありません。git remote add origin <URL> → git push で作ります。');
  return repo;
}

/** GitHub ユーザー名 → コミットに書く名前とメール */
export function identity(world: World, login: string, time: number): Signature {
  if (login === ME) return { ...world.local.config.user, time, tz: '+0900' };
  return { name: login[0].toUpperCase() + login.slice(1), email: `${login}@example.com`, time, tz: '+0900' };
}

const GITHUB = (time: number): Signature => ({ name: 'GitHub', email: 'noreply@github.com', time, tz: '+0000' });

function nextNumber(world: Draft<World>): number {
  const used = [...world.hosting.pullRequests.map((p) => p.number), ...(world.hosting.issues ?? []).map((i) => i.number)];
  const n = Math.max(world.hosting.nextNumber ?? 1, ...used.map((u) => u + 1));
  world.hosting.nextNumber = n + 1;
  return n;
}

export function prOrFail(ctx: Ctx, n?: number): Draft<PullRequest> {
  const pr = findPr(ctx.world as World, n) as Draft<PullRequest> | undefined;
  if (!pr) fail(n === undefined ? 'no pull requests found' : `GraphQL: Could not resolve to a PullRequest with the number of ${n}. (repository.pullRequest)`, 'その番号の PR はありません。gh pr list で確かめましょう。');
  return pr;
}

export type OpenPr = { title: string; body?: string; head: string; base?: string; author?: string; draft?: boolean };

export function openPr(ctx: Ctx, p: OpenPr): Draft<PullRequest> {
  const repo = hostedOrFail(ctx);
  const base = p.base ?? defaultBranch(repo);
  const slug = repoSlug(ctx.world as World);
  if (!repo.refs.heads[p.head]) fail(`pull request create failed: GraphQL: Head sha can't be blank, Base sha can't be blank, No commits between ${base} and ${p.head}, Head ref must be a branch (createPullRequest)`, `GitHub に ${p.head} ブランチがありません。先に git push -u origin ${p.head} で送りましょう。`);
  if (!repo.refs.heads[base]) fail(`base branch ${base} does not exist`);
  if (p.head === base) fail(`pull request create failed: head and base are the same branch (${base})`, 'PR は「別のブランチを base に取り込む」依頼です。作業用のブランチを作って push しましょう。');
  const dup = ctx.world.hosting.pullRequests.find((x) => x.state === 'open' && x.head === p.head && x.base === base);
  if (dup) fail(`a pull request for branch "${p.head}" into branch "${base}" already exists:\nhttps://github.com/${slug}/pull/${dup.number}`, '同じブランチの PR はすでにあります。追加のコミットを push すれば、その PR に自動で反映されます。');
  const pr: PullRequest = { number: nextNumber(ctx.world), title: p.title, body: p.body ?? '', author: p.author ?? ME, head: p.head, base, state: 'open', draft: p.draft, reviews: [], comments: [], createdAt: ctx.tick() };
  if (!prCommits(repo as RepoState, pr).length) fail(`pull request create failed: GraphQL: No commits between ${base} and ${p.head} (createPullRequest)`, `${p.head} には ${base} にないコミットがありません。コミットして push してから PR を作ります。`);
  ctx.world.hosting.pullRequests.push(pr);
  ctx.emit({ type: 'PR_OPENED', number: pr.number, author: pr.author, head: pr.head, base });
  return ctx.world.hosting.pullRequests[ctx.world.hosting.pullRequests.length - 1];
}

export function reviewPr(ctx: Ctx, n: number | undefined, r: { author?: string; state: Review['state']; body?: string }) {
  const pr = prOrFail(ctx, n);
  const author = r.author ?? ME;
  if (pr.state !== 'open') fail(`Pull request #${pr.number} is ${pr.state}`, 'オープン中の PR だけレビューできます。');
  if (author === pr.author && r.state !== 'commented')
    fail(`failed to create review: GraphQL: Review Can not ${r.state === 'approved' ? 'approve' : 'request changes on'} your own pull request (addPullRequestReview)`, '自分の PR は承認（Approve）も修正依頼もできません（GitHub と同じ）。チームの誰かにレビューしてもらいます。');
  if (r.state !== 'approved' && !r.body) fail('body cannot be blank for comment and request changes review', 'コメントや修正依頼には本文（-b "..."）が必要です。');
  pr.reviews.push({ author, state: r.state, body: r.body ?? '', time: ctx.tick() });
  ctx.emit({ type: 'PR_REVIEWED', number: pr.number, author, state: r.state });
}

export function commentPr(ctx: Ctx, n: number | undefined, c: { author?: string; body: string; path?: string; line?: number }) {
  const pr = prOrFail(ctx, n);
  if (!c.body) fail('body cannot be blank', 'コメントの本文を書いてください。');
  pr.comments.push({ author: c.author ?? ME, body: c.body, path: c.path, line: c.line, time: ctx.tick() });
  ctx.emit({ type: 'PR_COMMENTED', number: pr.number, author: c.author ?? ME });
}

export function closePr(ctx: Ctx, n: number | undefined) {
  const pr = prOrFail(ctx, n);
  if (pr.state !== 'open') fail(`Pull request #${pr.number} is already ${pr.state}`);
  pr.state = 'closed';
  ctx.emit({ type: 'PR_CLOSED', number: pr.number });
}

export function setDraft(ctx: Ctx, n: number | undefined, draft: boolean) {
  prOrFail(ctx, n).draft = draft;
}

export function deleteRemoteBranch(ctx: Ctx, branch: string) {
  const repo = hostedOrFail(ctx);
  if (!repo.refs.heads[branch]) fail(`branch ${branch} not found`);
  if (branch === defaultBranch(repo)) fail('既定ブランチは削除できません。');
  if (protectionOf(ctx.world as World, branch)) fail(`保護されたブランチ ${branch} は削除できません。`);
  delete repo.refs.heads[branch];
}

/** PR をマージする（GitHub の「Merge pull request」ボタン） */
export function mergePr(ctx: Ctx, n: number | undefined, method: MergeMethod, o: { by?: string; deleteBranch?: boolean } = {}) {
  const world = ctx.world as World;
  const pr = prOrFail(ctx, n);
  const repo = hostedOrFail(ctx);
  const allowed = world.hosting.mergeMethods ?? ['merge', 'squash', 'rebase'];
  if (!allowed.includes(method)) fail(`${method} merges are not allowed on this repository`, `このリポジトリでは ${allowed.join(' / ')} だけが許可されています（Settings で変えられます）。`);
  const blockers = mergeBlockers(world, pr);
  if (blockers.length) fail(`X Pull request ${repoSlug(world)}#${pr.number} is not mergeable: the base branch policy prohibits the merge.\n${blockers.map((b) => `  - ${b}`).join('\n')}`, 'マージの条件を満たしていません。上の理由を解消してから、もう一度マージします。');
  const by = o.by ?? ME;
  const time = ctx.tick();
  const base = repo.refs.heads[pr.base];
  const head = repo.refs.heads[pr.head];
  const commits = prCommits(repo as RepoState, pr).reverse();
  const merged = () => mergeTrees(repo as RepoState, commitFiles(repo, mergeBase(repo, base, head)), commitFiles(repo, base), commitFiles(repo, head), { ours: pr.base, theirs: pr.head });
  let oid: string;
  if (method === 'merge') {
    const m = merged();
    oid = writeCommit(repo, { tree: writeTree(repo, m.result), parents: [base, head], author: identity(world, by, time), committer: GITHUB(time), message: `Merge pull request #${pr.number} from ${repoSlug(world).split('/')[0]}/${pr.head}\n\n${pr.title}` });
  } else if (method === 'squash') {
    const m = merged();
    const bullets = commits.map((c) => `* ${getCommit(repo, c).message}`).join('\n\n');
    oid = writeCommit(repo, { tree: writeTree(repo, m.result), parents: [base], author: identity(world, pr.author, time), committer: GITHUB(time), message: `${pr.title} (#${pr.number})${commits.length > 1 ? `\n\n${bullets}` : ''}` });
  } else {
    // rebase：PR のコミットを1つずつ base の先に付け直す（作者はそのまま、committer は GitHub）
    oid = base;
    for (const c of commits) {
      const commit = getCommit(repo, c);
      const m = mergeTrees(repo as RepoState, commitFiles(repo, commit.parents[0] ?? null), commitFiles(repo, oid), commitFiles(repo, c), { ours: pr.base, theirs: subject(commit.message) });
      if (m.conflicts.length) fail('This branch cannot be rebased due to conflicts', 'rebase マージではコミットごとに付け直すため、途中でぶつかってしまいます。merge か squash を使うか、手元で rebase してから push します。');
      oid = writeCommit(repo, { tree: writeTree(repo, m.result), parents: [oid], author: commit.author, committer: GITHUB(time), message: commit.message });
    }
  }
  repo.refs.heads[pr.base] = oid;
  pr.state = 'merged';
  pr.merged = { method, oid, by, time };
  for (const i of linkedIssues(pr)) {
    const issue = ctx.world.hosting.issues?.find((x) => x.number === i);
    if (issue && issue.state === 'open') {
      issue.state = 'closed';
      issue.closedBy = pr.number;
      ctx.emit({ type: 'ISSUE_CLOSED', number: i, by: pr.number });
    }
  }
  ctx.emit({ type: 'PR_MERGED', number: pr.number, method, oid, base: pr.base });
  if (o.deleteBranch && !protectionOf(world, pr.head)) delete repo.refs.heads[pr.head];
  return oid;
}

export function setProtection(ctx: Ctx, branch: string, p: Omit<BranchProtection, 'branch'> | null) {
  const list = ctx.world.hosting.protections;
  const i = list.findIndex((x) => x.branch === branch);
  if (i >= 0) list.splice(i, 1);
  if (p) list.push({ branch, ...p });
  ctx.emit({ type: 'PROTECTION_CHANGED', branch });
}

