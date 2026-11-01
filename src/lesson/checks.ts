// 判定条件（check）の評価。結果は日本語の説明付きで返し、「答え合わせ」ボタンにも使う。
import { getBlob, getCommit, hashBlob, commitFiles, peel } from '../engine/model/objects';
import { latestReviews } from '../hosting/model';
import { ancestors, currentBranch, headOid, resolveRev } from '../engine/model/refs';
import { computeStatus } from '../engine/model/status';
import { aheadBehind, upstreamOf } from '../engine/remote';
import type { Oid, World } from '../engine/model/types';
import type { Check, GraphShape } from './types';

export type CheckContext = {
  world: World;
  aliases: Record<string, Oid>;
  /** このステップの間に実行したコマンド */
  commands: string[];
};

export type CheckResult = { ok: boolean; label: string };

function resolve(ctx: CheckContext, ref: string): Oid | null {
  return ctx.aliases[ref] ?? resolveRev(ctx.world.local, ref);
}

const normalize = (cmd: string) => cmd.trim().replace(/\s+/g, ' ');

/** "git commit" は "git commit -m x" にも当てはまる（前方一致・単語単位） */
export function commandMatches(used: string, pattern: string): boolean {
  const u = normalize(used).split(' ');
  const p = normalize(pattern).split(' ');
  return p.every((w, i) => u[i] === w);
}

function reachableCommits(world: World): Oid[] {
  const repo = world.local;
  const tips = [...Object.values(repo.refs.heads)];
  const h = headOid(repo);
  if (h) tips.push(h);
  const all = new Set<Oid>();
  for (const t of tips) for (const o of ancestors(repo, t)) all.add(o);
  return [...all];
}

export function matchGraph(world: World, expected: GraphShape): boolean {
  const repo = world.local;
  const msgOf = (o: Oid) => getCommit(repo, o).message.split('\n')[0];
  const actual = reachableCommits(world).map((o) => `${msgOf(o)} <- ${getCommit(repo, o).parents.map(msgOf).sort().join(',')}`).sort();
  const want = expected.commits.map((c) => `${c.msg} <- ${[...(c.parents ?? [])].sort().join(',')}`).sort();
  if (JSON.stringify(actual) !== JSON.stringify(want)) return false;
  for (const [b, msg] of Object.entries(expected.branches ?? {})) {
    const oid = repo.refs.heads[b];
    if (!oid || msgOf(oid) !== msg) return false;
  }
  if (expected.head && currentBranch(repo) !== expected.head) return false;
  return true;
}

function hasMerge(world: World, ref: string): boolean {
  const oid = resolveRev(world.local, ref);
  if (!oid) return false;
  return [...ancestors(world.local, oid)].some((o) => getCommit(world.local, o).parents.length > 1);
}

export function evaluate(check: Check, ctx: CheckContext): CheckResult {
  const repo = ctx.world.local;
  switch (check.type) {
    case 'repoInitialized':
      return { ok: repo.initialized, label: 'Git リポジトリになっている' };
    case 'refEquals': {
      const to = resolve(ctx, check.to);
      return { ok: !!to && repo.refs.heads[check.ref] === to, label: `${check.ref} が ${check.to} を指している` };
    }
    case 'headOn':
      if (check.detached) return { ok: repo.head.type === 'detached', label: 'HEAD が detached（コミットを直接指している）' };
      return { ok: currentBranch(repo) === check.branch, label: `HEAD が ${check.branch} にある` };
    case 'graphShape':
      return { ok: repo.initialized && matchGraph(ctx.world, check.expected), label: 'コミットグラフがお手本と同じ形' };
    case 'fileContent': {
      const area = check.area ?? 'worktree';
      let content: string | undefined;
      if (area === 'worktree') content = repo.workingTree[check.path];
      else if (area === 'index') content = repo.index[check.path] ? getBlob(repo, repo.index[check.path]) : undefined;
      else {
        const f = commitFiles(repo, headOid(repo))[check.path];
        content = f ? getBlob(repo, f) : undefined;
      }
      const where = { worktree: 'ワークツリー', index: 'ステージ', head: '最新コミット' }[area];
      if (check.exists === false) return { ok: content === undefined, label: `${where}に ${check.path} がない` };
      if (content === undefined) return { ok: false, label: `${where}に ${check.path} がある` };
      if (check.notContains !== undefined) return { ok: !content.includes(check.notContains), label: `${where}の ${check.path} に「${check.notContains}」が残っていない` };
      if (check.equals !== undefined) return { ok: content === check.equals, label: `${where}の ${check.path} の内容が正しい` };
      if (check.contains !== undefined) return { ok: content.includes(check.contains), label: `${where}の ${check.path} に「${check.contains}」が含まれる` };
      return { ok: true, label: `${where}に ${check.path} がある` };
    }
    case 'fileStatus': {
      const label = { untracked: '未追跡', ignored: '無視されている', staged: 'ステージ済み', modified: '変更あり（未ステージ）', clean: '変更なし', conflicted: 'コンフリクト中' }[check.status];
      if (!repo.initialized) return { ok: false, label: `${check.path} が${label}` };
      const s = computeStatus(repo);
      const p = check.path;
      const ok = {
        untracked: s.untracked.includes(p),
        ignored: s.ignored.includes(p),
        staged: s.staged.some((e) => e.path === p),
        modified: s.unstaged.some((e) => e.path === p),
        conflicted: s.conflicts.includes(p),
        clean: p in repo.index && !s.staged.some((e) => e.path === p) && !s.unstaged.some((e) => e.path === p) && hashBlob(repo.workingTree[p] ?? '') === repo.index[p],
      }[check.status];
      return { ok, label: `${p} が${label}` };
    }
    case 'statusClean': {
      if (!repo.initialized) return { ok: false, label: '未コミットの変更がない' };
      const s = computeStatus(repo);
      const ok = !s.staged.length && !s.unstaged.length && !s.conflicts.length && (check.includeUntracked === false || !s.untracked.length) && !repo.inProgress;
      return { ok, label: '未コミットの変更がない（working tree clean）' };
    }
    case 'commitCount': {
      const ref = check.ref ?? 'HEAD';
      const oid = resolveRev(repo, ref);
      const n = oid ? ancestors(repo, oid).size : 0;
      if (check.min !== undefined) return { ok: n >= check.min, label: `${ref} のコミットが ${check.min} 個以上` };
      return { ok: n === check.count, label: `${ref} のコミットが ${check.count} 個` };
    }
    case 'noMergeCommit':
      return { ok: repo.initialized && !hasMerge(ctx.world, check.ref ?? 'HEAD'), label: 'マージコミットがない' };
    case 'hasMergeCommit':
      return { ok: repo.initialized && hasMerge(ctx.world, check.ref ?? 'HEAD'), label: 'マージコミットがある' };
    case 'branchExists': {
      const exists = check.exists ?? true;
      return { ok: (check.name in repo.refs.heads) === exists, label: `ブランチ ${check.name} が${exists ? 'ある' : 'ない'}` };
    }
    case 'configEquals': {
      const v = repo.config.user[check.key === 'user.name' ? 'name' : 'email'];
      const ok = check.value === undefined ? v !== 'You' && v !== 'you@example.com' : v === check.value;
      return { ok, label: `${check.key} が設定されている` };
    }
    case 'commandUsed':
      return { ok: ctx.commands.some((c) => commandMatches(c, check.command)), label: `${check.command} を実行した` };
    case 'commandNotUsed':
      return { ok: !ctx.commands.some((c) => commandMatches(c, check.command)), label: `${check.command} を使っていない` };
    case 'remoteEquals': {
      const remoteName = check.remote ?? 'origin';
      const remote = ctx.world.remotes[remoteName];
      const want = check.to ? resolve(ctx, check.to) : repo.refs.heads[check.ref];
      return { ok: !!remote && !!want && remote.refs.heads[check.ref] === want, label: check.to ? `${remoteName} の ${check.ref} が ${check.to} を指している` : `${remoteName} の ${check.ref} が手元の ${check.ref} と同じ（push 済み）` };
    }
    case 'aheadBehind': {
      const branch = check.branch ?? currentBranch(repo);
      const up = upstreamOf(repo, branch);
      const local = branch ? repo.refs.heads[branch] : null;
      const theirs = up ? repo.refs.remotes[up.remote]?.[up.branch] : null;
      const ab = local && theirs ? aheadBehind(repo, local, theirs) : null;
      return { ok: !!ab && ab.ahead === check.ahead && ab.behind === check.behind, label: `${branch} が追跡先より ${check.ahead} 進み、${check.behind} 遅れている` };
    }
    case 'prState': {
      const prs = ctx.world.hosting.pullRequests.filter((p) => (check.pr === undefined || p.number === check.pr) && (!check.head || p.head === check.head));
      const pr = prs[prs.length - 1];
      const what = check.pr !== undefined ? `PR #${check.pr}` : check.head ? `${check.head} の PR` : 'PR';
      if (check.exists === false) return { ok: !pr, label: `${what} がない` };
      const reviews = pr ? latestReviews(pr) : [];
      const ok =
        !!pr &&
        (!check.state || pr.state === check.state) &&
        (!check.method || pr.merged?.method === check.method) &&
        (!check.approvedBy || reviews.some((r) => r.author === check.approvedBy && r.state === 'approved')) &&
        (!check.reviewedBy || pr.reviews.some((r) => r.author === check.reviewedBy));
      const parts = [check.state && { open: 'オープン中', merged: 'マージ済み', closed: 'クローズ済み' }[check.state], check.method && `${check.method} でマージ`, check.approvedBy && `${check.approvedBy} が承認`, check.reviewedBy && `${check.reviewedBy} がレビュー`].filter(Boolean);
      return { ok, label: `${what} がある${parts.length ? `（${parts.join('・')}）` : ''}` };
    }
    case 'issueState': {
      const issue = ctx.world.hosting.issues?.find((i) => i.number === check.number);
      return { ok: issue?.state === check.state, label: `Issue #${check.number} が${check.state === 'open' ? 'オープン' : 'クローズ'}` };
    }
    case 'protection': {
      const p = ctx.world.hosting.protections.find((x) => x.branch === check.branch);
      const ok =
        !!p &&
        (check.requirePullRequest === undefined || p.requirePullRequest === check.requirePullRequest) &&
        (check.requiredApprovals === undefined || (p.requiredApprovals ?? 0) >= check.requiredApprovals) &&
        (check.requireStatusChecks === undefined || !!p.requireStatusChecks === check.requireStatusChecks);
      return { ok, label: `${check.branch} にブランチ保護が設定されている${check.requiredApprovals ? `（承認 ${check.requiredApprovals} 件以上）` : ''}` };
    }
    case 'noViolations': {
      const v = ctx.world.hosting.violations ?? [];
      return { ok: v.length === 0, label: v.length ? `ブランチ戦略のルール違反がない（今は ${v.length} 件）` : 'ブランチ戦略のルール違反がない' };
    }
    case 'stashCount':
      return { ok: repo.stash.length === check.count, label: `stash が ${check.count} 件` };
    case 'inProgress':
      return { ok: (repo.inProgress?.op ?? null) === check.op, label: check.op ? `${check.op} の途中` : '途中の操作（merge / rebase など）がない' };
    case 'tagExists': {
      const oid = repo.refs.tags[check.name];
      const obj = oid ? repo.objects[oid] : undefined;
      const ok = !!oid && (check.annotated === undefined || (obj?.type === 'tag') === check.annotated) && (!check.at || (oid && peel(repo, oid) === resolve(ctx, check.at)));
      return { ok: !!ok, label: `タグ ${check.name}${check.annotated ? '（注釈付き）' : ''} がある${check.at ? `（${check.at} を指す）` : ''}` };
    }
  }
}

export function evaluateAll(checks: Check[], ctx: CheckContext): CheckResult[] {
  return checks.map((c) => evaluate(c, ctx));
}
