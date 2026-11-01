// GitHub CLI（gh）の模擬。PR の作成・確認・レビュー・マージをターミナルから行う。
import { fail, unsupported, type Ctx } from '../engine/command';
import { OptionError, parseArgs, type OptSpec } from '../engine/parser';
import type { ProgramDef } from '../engine/run';
import type { MergeMethod, World } from '../engine/model/types';
import { getCommit } from '../engine/model/objects';
import { currentBranch } from '../engine/model/refs';
import { computeStatus } from '../engine/model/status';
import { fetchRemote } from '../engine/remote';
import { createBranchAndSwitch, moveHead } from '../engine/commands/switch';
import { latestReviews, mergeBlockers, prChecks, prCommits, prFiles, repoSlug, ME } from './model';
import { closePr, commentPr, hostedOrFail, mergePr, openPr, prOrFail, reviewPr, setDraft } from './ops';

function parse(args: string[], spec: OptSpec) {
  try {
    return parseArgs(args, spec);
  } catch (e) {
    if (e instanceof OptionError) fail(e.message, 'このサイトの gh では未対応のオプションです。gh help で使えるものを確かめましょう。');
    throw e;
  }
}

const num = (s?: string) => (s === undefined ? undefined : Number(s.replace(/^#/, '')) || fail(`invalid pull request number: ${s}`));

/** 番号を省くと、今のブランチの PR */
function prNumber(ctx: Ctx, arg?: string): number | undefined {
  if (arg) return num(arg);
  const branch = currentBranch(ctx.repo);
  const pr = ctx.world.hosting.pullRequests.find((p) => p.head === branch && p.state === 'open') ?? ctx.world.hosting.pullRequests.find((p) => p.head === branch);
  if (!pr) fail(`no pull requests found for branch "${branch}"`, 'このブランチの PR はまだありません。番号を指定するか、gh pr create で作ります。');
  return pr.number;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const url = (ctx: Ctx, n: number, kind = 'pull') => `https://github.com/${repoSlug(ctx.world as World)}/${kind}/${n}`;

function prCreate(ctx: Ctx, args: string[]) {
  const { opts } = parse(args, { short: { t: 'title', b: 'body', B: 'base', H: 'head', d: 'draft', f: 'fill' }, valued: ['title', 'body', 'base', 'head'], long: ['draft', 'fill', 'web'] });
  if (opts.web) unsupported('gh pr create --web', 'ブラウザで PR 作成画面を開きます。このサイトでは GitHub タブの「New pull request」を使ってください');
  const head = (opts.head as string | undefined) ?? currentBranch(ctx.repo);
  if (!head) fail('could not determine the current branch', 'detached HEAD では --head でブランチを指定します。');
  const repo = hostedOrFail(ctx);
  let title = opts.title as string | undefined;
  let body = (opts.body as string | undefined) ?? '';
  if (opts.fill) {
    const tip = repo.refs.heads[head] ?? ctx.repo.refs.heads[head];
    if (tip) {
      const [first, ...rest] = getCommit(ctx.world.remotes.origin?.objects[tip] ? ctx.world.remotes.origin : ctx.repo, tip).message.split('\n');
      title ??= first;
      body ||= rest.join('\n').trim();
    }
  }
  if (!title) fail('must provide `--title` and `--body` (or `--fill`) when not running interactively', 'gh pr create --title "タイトル" --body "説明" のように指定します（--fill でコミットメッセージを使います）。');
  const dirty = computeStatus(ctx.repo);
  const n = dirty.staged.length + dirty.unstaged.length;
  if (n) ctx.out(`Warning: ${plural(n, 'uncommitted change')}`, 'yellow');
  const pr = openPr(ctx, { title, body, head, base: opts.base as string | undefined, draft: Boolean(opts.draft) });
  ctx.out(url(ctx, pr.number));
  ctx.hint(`PR #${pr.number} を作りました。GitHub タブで中身（Commits / Files changed）を確認できます。`);
}

function prList(ctx: Ctx, args: string[]) {
  const { opts } = parse(args, { short: { s: 'state' }, valued: ['state'] });
  const state = (opts.state as string | undefined) ?? 'open';
  const prs = ctx.world.hosting.pullRequests.filter((p) => state === 'all' || p.state === state).slice().reverse();
  const slug = repoSlug(ctx.world as World);
  if (!prs.length) return ctx.out(`no ${state === 'all' ? '' : `${state} `}pull requests in ${slug}`);
  ctx.out(`Showing ${prs.length} of ${plural(prs.length, `${state === 'all' ? '' : `${state} `}pull request`)} in ${slug}`);
  ctx.out('');
  const w = Math.max(...prs.map((p) => p.title.length), 5);
  ctx.out(`${'ID'.padEnd(4)}  ${'TITLE'.padEnd(w)}  BRANCH`, 'dim');
  for (const p of prs) ctx.out(`#${String(p.number).padEnd(3)}  ${p.title.padEnd(w)}  ${p.head}${p.state !== 'open' ? `  (${p.state})` : ''}`, p.state === 'open' ? 'green' : 'dim');
}

function prView(ctx: Ctx, args: string[]) {
  const { positional } = parse(args, { long: ['comments', 'web'] });
  const pr = prOrFail(ctx, prNumber(ctx, positional[0]));
  const repo = hostedOrFail(ctx);
  const commits = prCommits(repo, pr);
  const files = prFiles(repo, pr);
  const checks = prChecks(ctx.world as World, pr);
  const state = pr.draft && pr.state === 'open' ? 'Draft' : { open: 'Open', merged: 'Merged', closed: 'Closed' }[pr.state];
  const ins = files.reduce((a, f) => a + (f.after?.split('\n').filter(Boolean).length ?? 0), 0);
  const del = files.reduce((a, f) => a + (f.before?.split('\n').filter(Boolean).length ?? 0), 0);
  ctx.out(`${pr.title} #${pr.number}`, 'normal');
  ctx.out(`${state} • ${pr.author} ${pr.state === 'merged' ? 'merged' : 'wants to merge'} ${plural(commits.length, 'commit')} into ${pr.base} from ${pr.head}`, pr.state === 'open' ? 'green' : 'dim');
  ctx.out(`+${ins} -${del} • ${checks.every((c) => c.ok) ? '✓ Checks passing' : '× Some checks failing'}`);
  const reviews = latestReviews(pr);
  if (reviews.length) ctx.out(`Reviewers: ${reviews.map((r) => `${r.author} (${{ approved: 'Approved', changes_requested: 'Changes requested', commented: 'Commented' }[r.state]})`).join(', ')}`);
  ctx.out('');
  for (const l of (pr.body || 'No description provided').split('\n')) ctx.out(`  ${l}`);
  ctx.out('');
  if (pr.state === 'open') {
    const blockers = mergeBlockers(ctx.world as World, pr);
    if (blockers.length) for (const b of blockers) ctx.out(`× ${b}`, 'red');
    else ctx.out('✓ マージできます（gh pr merge）', 'green');
    ctx.out('');
  }
  ctx.out(`View this pull request on GitHub: ${url(ctx, pr.number)}`, 'dim');
}

function prChecksCmd(ctx: Ctx, args: string[]) {
  const { positional } = parse(args, {});
  const pr = prOrFail(ctx, prNumber(ctx, positional[0]));
  for (const c of prChecks(ctx.world as World, pr)) ctx.out(`${c.name}\t${c.ok ? 'pass' : 'fail'}\t12s\t${url(ctx, pr.number, 'actions/runs')}\t${c.ok ? '' : c.detail}`, c.ok ? 'green' : 'red');
}

function prReview(ctx: Ctx, args: string[]) {
  const { opts, positional } = parse(args, { short: { a: 'approve', r: 'request-changes', c: 'comment', b: 'body' }, valued: ['body'], long: ['approve', 'request-changes', 'comment'] });
  const state = opts.approve ? 'approved' : opts['request-changes'] ? 'changes_requested' : opts.comment ? 'commented' : null;
  if (!state) fail('--approve, --request-changes, or --comment required when not running interactively', '例: gh pr review 1 --approve / gh pr review 1 --request-changes -b "テストを足してください"');
  const n = prNumber(ctx, positional[0]);
  reviewPr(ctx, n, { state, body: opts.body as string | undefined });
  ctx.out({ approved: `✓ Approved pull request #${n}`, changes_requested: `+ Requested changes to pull request #${n}`, commented: `- Reviewed pull request #${n}` }[state], 'green');
}

function prMerge(ctx: Ctx, args: string[]) {
  const { opts, positional } = parse(args, { short: { m: 'merge', s: 'squash', r: 'rebase', d: 'delete-branch' }, long: ['merge', 'squash', 'rebase', 'delete-branch', 'auto', 'admin'] });
  if (opts.auto || opts.admin) unsupported(`gh pr merge --${opts.auto ? 'auto' : 'admin'}`, opts.auto ? '条件を満たしたら自動でマージします' : '管理者権限で保護を無視してマージします');
  const method: MergeMethod | null = opts.merge ? 'merge' : opts.squash ? 'squash' : opts.rebase ? 'rebase' : null;
  if (!method) fail('--merge, --rebase, or --squash required when not running interactively', 'マージ方式を選びます：--merge（マージコミット）、--squash（1つにまとめる）、--rebase（付け直す）。');
  const pr = prOrFail(ctx, prNumber(ctx, positional[0]));
  const { number, title, head, base } = pr;
  mergePr(ctx, number, method, { deleteBranch: Boolean(opts['delete-branch']) });
  ctx.out(`✓ ${{ merge: 'Merged', squash: 'Squashed and merged', rebase: 'Rebased and merged' }[method]} pull request #${number} (${title})`, 'green');
  if (opts['delete-branch']) {
    const repo = ctx.repo;
    if (repo.refs.heads[head]) {
      if (currentBranch(repo) === head && repo.refs.heads[base]) moveHead(ctx, { branch: base });
      if (currentBranch(repo) !== head) {
        delete repo.refs.heads[head];
        if (repo.config.branches) delete repo.config.branches[head];
        ctx.out(`✓ Deleted local branch ${head} and switched to branch ${currentBranch(repo)}`, 'green');
      }
    }
    if (repo.refs.remotes.origin) delete repo.refs.remotes.origin[head];
    ctx.out(`✓ Deleted remote branch ${head}`, 'green');
  }
  ctx.hint(`GitHub の ${base} が進みました。手元の ${base} は古いままなので、git switch ${base} → git pull で取り込みます（このサイトの gh は pull まではしません）。`);
}

function prCheckout(ctx: Ctx, args: string[]) {
  const { positional } = parse(args, {});
  const pr = prOrFail(ctx, num(positional[0]) ?? fail('usage: gh pr checkout <number>'));
  fetchRemote(ctx, 'origin', { quiet: true });
  if (!ctx.repo.refs.remotes.origin?.[pr.head]) fail(`branch ${pr.head} not found on origin`, 'PR のブランチが GitHub 上で削除されています。');
  if (ctx.repo.refs.heads[pr.head]) {
    moveHead(ctx, { branch: pr.head });
    ctx.out(`Switched to branch '${pr.head}'`);
  } else createBranchAndSwitch(ctx, pr.head, `origin/${pr.head}`, true);
}

function prComment(ctx: Ctx, args: string[]) {
  const { opts, positional } = parse(args, { short: { b: 'body' }, valued: ['body'] });
  const n = prNumber(ctx, positional[0]);
  commentPr(ctx, n, { body: (opts.body as string | undefined) ?? '' });
  ctx.out(`${url(ctx, n!)}#issuecomment-${ctx.world.clock}`);
}

function issue(ctx: Ctx, [sub, ...args]: string[]) {
  const issues = ctx.world.hosting.issues ?? [];
  const slug = repoSlug(ctx.world as World);
  if (sub === 'list') {
    const open = issues.filter((i) => i.state === 'open');
    if (!open.length) return ctx.out(`no open issues in ${slug}`);
    ctx.out(`Showing ${open.length} of ${plural(open.length, 'open issue')} in ${slug}`);
    ctx.out('');
    for (const i of open) ctx.out(`#${i.number}  ${i.title}`, 'green');
    return;
  }
  if (sub === 'view') {
    const i = issues.find((x) => x.number === num(args[0]));
    if (!i) fail(`GraphQL: Could not resolve to an issue or pull request with the number of ${args[0]}.`);
    ctx.out(`${i.title} #${i.number}`);
    ctx.out(`${i.state === 'open' ? 'Open' : 'Closed'} • ${i.author} opened${i.closedBy ? ` • closed by #${i.closedBy}` : ''}`);
    ctx.out('');
    for (const l of (i.body || 'No description provided').split('\n')) ctx.out(`  ${l}`);
    return;
  }
  unsupported(`gh issue ${sub ?? ''}`.trim(), 'gh issue list / gh issue view <番号> が使えます');
}

const PR: Record<string, (ctx: Ctx, args: string[]) => void> = {
  create: prCreate,
  list: prList,
  view: prView,
  status: prList,
  checks: prChecksCmd,
  review: prReview,
  merge: prMerge,
  checkout: prCheckout,
  comment: prComment,
  close: (ctx, args) => {
    const n = prNumber(ctx, args[0]);
    closePr(ctx, n);
    ctx.out(`✓ Closed pull request #${n}`, 'red');
  },
  ready: (ctx, args) => {
    const n = prNumber(ctx, args[0]);
    setDraft(ctx, n, false);
    ctx.out(`✓ Pull request #${n} is marked as "ready for review"`, 'green');
  },
};

export const GH: ProgramDef = {
  name: 'gh',
  run(ctx, [group, sub, ...args]) {
    if (!ctx.repo.initialized) fail('failed to run git: fatal: not a git repository (or any of the parent directories): .git', 'gh は Git リポジトリの中で使います。');
    if (group === 'pr') {
      const fn = sub ? PR[sub] : undefined;
      if (!fn) fail(`unknown command "${sub ?? ''}" for "gh pr"`, `gh pr で使えるもの: ${Object.keys(PR).join(', ')}`);
      return fn(ctx, args);
    }
    if (group === 'issue') return issue(ctx, [sub, ...args]);
    if (group === 'auth' && sub === 'status') {
      ctx.out('github.com');
      ctx.out(`  ✓ Logged in to github.com account ${ME} (Git Training の模擬環境)`);
      return;
    }
    if (!group || group === 'help' || group === '--help') {
      ctx.out('Work seamlessly with GitHub from the command line.');
      ctx.out('');
      ctx.out('USAGE');
      ctx.out('  gh <command> <subcommand> [flags]');
      ctx.hint(`このサイトで使えるもの: gh pr ${Object.keys(PR).join(' / ')}、gh issue list / view`);
      return;
    }
    unsupported(`gh ${group}`, 'gh pr と gh issue が使えます');
  },
};


