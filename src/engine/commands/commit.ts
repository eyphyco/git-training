import { fail, unsupported, type CommandDef, type Ctx } from '../command';
import { commitFiles, getCommit, short, subject, writeBlob, writeCommit, writeTree } from '../model/objects';
import { formatDate } from './log';
import { runHook } from '../hooks';
import { currentBranch, headOid, isAncestor, logRef, resolveRev, setBranch } from '../model/refs';
import { computeStatus } from '../model/status';
import type { Oid, Signature } from '../model/types';
import { printSummary, treeDiffStat } from '../stat';

export type HeadCommit = { tree: Oid; parents: Oid[]; message: string; time: number; author?: Signature; reflog: string };

export function you(ctx: Ctx, time: number): Signature {
  return { ...ctx.repo.config.user, time, tz: '+0900' };
}

/** HEAD（ブランチにいればそのブランチ）を動かし、reflog を残す */
export function moveHead(ctx: Ctx, oid: Oid, reflog: string) {
  const repo = ctx.repo;
  const branch = currentBranch(repo);
  if (branch) setBranch(repo, branch, oid, reflog, ctx.world.clock);
  else {
    const old = headOid(repo);
    repo.head = { type: 'detached', oid };
    logRef(repo, 'HEAD', old, oid, reflog, ctx.world.clock);
  }
}

/** コミットオブジェクトを書いて HEAD を進める。author を省くと自分（committer と同じ） */
export function writeHeadCommit(ctx: Ctx, c: HeadCommit): Oid {
  const repo = ctx.repo;
  const committer = you(ctx, c.time);
  const oid = writeCommit(repo, { tree: c.tree, parents: c.parents, author: c.author ?? committer, committer, message: c.message });
  const branch = currentBranch(repo);
  const old = headOid(repo);
  moveHead(ctx, oid, `${c.reflog}: ${subject(c.message)}`);
  ctx.emit({ type: 'COMMIT_CREATED', oid, parents: [...c.parents], branch, message: c.message });
  ctx.emit({ type: 'REF_MOVED', ref: branch ?? 'HEAD', from: old, to: oid, reason: 'commit' });
  return oid;
}

/** インデックスの内容でコミットを作り、HEAD（またはそのブランチ）を進める */
export function commitIndex(ctx: Ctx, message: string, parents: Oid[], reflogMsg: string): Oid {
  return writeHeadCommit(ctx, { tree: writeTree(ctx.repo, { ...ctx.repo.index }), parents, message, time: ctx.tick(), reflog: reflogMsg });
}

export function cleanupMessage(parts: string[]): string {
  return parts
    .map((p) => p.replace(/\s+$/g, '').replace(/^\n+/, ''))
    .filter((p) => p)
    .join('\n\n');
}

export const commit: CommandDef = {
  name: 'commit',
  spec: { short: { m: 'message', a: 'all', q: 'quiet', n: 'no-verify' }, multiple: ['message'], valued: ['fixup'], long: ['allow-empty', 'amend', 'no-edit', 'no-verify'] },
  run(ctx) {
    const repo = ctx.repo;
    const { opts } = ctx.args;
    if (ctx.args.positional.length) unsupported('パス指定付きの commit', 'git commit <path> は指定ファイルだけをコミットします。このサイトでは git add してから git commit してください');
    const merging = repo.inProgress?.op === 'merge' ? repo.inProgress : undefined;
    // cherry-pick / revert / rebase が衝突で止まっているときの commit は、その続きとして扱う
    const seq = repo.inProgress && repo.inProgress.op !== 'merge' && repo.inProgress.stopped === 'conflict' ? repo.inProgress : undefined;
    if (repo.inProgress?.conflicts.length)
      fail(
        "error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.",
        'コンフリクトが残っています。ファイルを直して git add してからコミットしましょう。',
      );
    const messages = (opts.message as string[] | undefined) ?? [];
    // --fixup <commit>：あとで rebase --autosquash がそのコミットに混ぜる目印の件名を付ける
    if (opts.fixup) {
      const target = resolveRev(repo, opts.fixup as string);
      if (!target) fail(`fatal: could not lookup commit '${opts.fixup}'`, `「${opts.fixup}」というコミットは見つかりません。`);
      messages.unshift(`fixup! ${subject(getCommit(repo, target).message)}`);
    }
    if (opts.amend) return amend(ctx, messages, Boolean(opts['no-edit']), Boolean(opts.all), Boolean(opts['no-verify']));
    if (!messages.length && !merging && !seq)
      fail('このサイトではエディタが開けないため、-m でメッセージを指定してください。', '例: git commit -m "README を追加"（実 Git では -m なしだとエディタが開きます）');
    const message = messages.length ? cleanupMessage(messages) : (merging?.message ?? seq!.message);
    if (!message) fail('Aborting commit due to empty commit message.');

    if (opts.all) {
      for (const p of Object.keys(repo.index)) {
        if (p in repo.workingTree) repo.index[p] = writeBlob(repo, repo.workingTree[p]);
        else delete repo.index[p];
      }
    }
    const s = computeStatus(repo);
    const parent = headOid(repo);
    if (!s.staged.length && !opts['allow-empty'] && !merging) {
      const branch = currentBranch(repo);
      ctx.out(branch ? `On branch ${branch}` : `HEAD detached at ${short(parent!)}`);
      if (s.unstaged.length) {
        ctx.out('Changes not staged for commit:');
        for (const e of s.unstaged) ctx.out(`\tmodified:   ${e.path}`, 'red');
        ctx.out('');
        ctx.out('no changes added to commit (use "git add" and/or "git commit -a")');
      } else if (s.untracked.length) ctx.out('nothing added to commit but untracked files present (use "git add" to track)');
      else ctx.out(parent ? 'nothing to commit, working tree clean' : 'nothing to commit (create/copy files and use "git add" to track)');
      fail('', 'ステージに何も載っていないのでコミットできません。先に git add しましょう。');
    }
    if (!opts['no-verify'] && !merging) verifyHooks(ctx, message);
    const parents = parent ? [parent] : [];
    if (merging) parents.push(merging.theirs);
    const before = commitFiles(repo, parent);
    // cherry-pick / rebase の続きなら作者は元のコミットのまま
    const author = seq?.current && seq.op !== 'revert' ? getCommit(repo, seq.current.oid).author : undefined;
    const oid = author
      ? writeHeadCommit(ctx, { tree: writeTree(repo, { ...repo.index }), parents, author, message, time: ctx.tick(), reflog: 'commit' })
      : commitIndex(ctx, message, parents, merging ? 'commit (merge)' : parent ? 'commit' : 'commit (initial)');
    if (merging) delete repo.inProgress;
    if (seq) {
      seq.current = null;
      seq.stopped = null;
      if (seq.op !== 'rebase' && !seq.todo.length) delete repo.inProgress;
      else ctx.hint(`続きは git ${seq.op} --continue で進めます。`);
    }
    if (opts.quiet) return;
    const branch = currentBranch(repo);
    const label = branch ? `${branch}${parent ? '' : ' (root-commit)'}` : 'detached HEAD';
    ctx.out(`[${label} ${short(oid)}] ${subject(message)}`);
    printSummary(ctx, treeDiffStat(repo, before, commitFiles(repo, oid)), false);
  },
};

/** git commit --amend：直前のコミットを作り直す（親はそのまま、作者と作者の時刻は元のまま） */
/** pre-commit と commit-msg の hook。失敗したらコミットを中止する */
function verifyHooks(ctx: Ctx, message: string) {
  if (!runHook(ctx, 'pre-commit')) fail('', 'pre-commit フックが 0 以外で終わったので、コミットを中止しました（--no-verify で飛ばせますが、チームのルールを破ることになります）。');
  if (!runHook(ctx, 'commit-msg', ['.git/COMMIT_EDITMSG'], { '.git/COMMIT_EDITMSG': `${message}\n` }))
    fail('', 'commit-msg フックがメッセージを受け付けなかったので、コミットを中止しました。メッセージを直してもう一度コミットします。');
}

function amend(ctx: Ctx, messages: string[], noEdit: boolean, all: boolean, noVerify = false) {
  const repo = ctx.repo;
  if (repo.inProgress?.op === 'merge') fail('fatal: You are in the middle of a merge -- cannot amend.', 'マージ中は amend できません。先にマージを完了するか中止しましょう。');
  const head = headOid(repo);
  if (!head) fail('fatal: You have nothing to amend.', 'まだコミットがありません。');
  if (!messages.length && !noEdit) fail('このサイトではエディタが開けないため、-m で新しいメッセージを指定するか --no-edit を付けてください。', '例: git commit --amend -m "直したメッセージ"、ファイルだけ足すなら git commit --amend --no-edit');
  if (all) for (const p of Object.keys(repo.index)) {
    if (p in repo.workingTree) repo.index[p] = writeBlob(repo, repo.workingTree[p]);
    else delete repo.index[p];
  }
  const old = getCommit(repo, head);
  const message = messages.length ? cleanupMessage(messages) : old.message;
  if (!noVerify) verifyHooks(ctx, message);
  const oid = writeHeadCommit(ctx, { tree: writeTree(repo, { ...repo.index }), parents: old.parents, author: old.author, message, time: ctx.tick(), reflog: 'commit (amend)' });
  ctx.emit({ type: 'COMMIT_AMENDED', from: head, to: oid });
  const branch = currentBranch(repo);
  ctx.out(`[${branch ?? 'detached HEAD'} ${short(oid)}] ${subject(message)}`);
  ctx.out(` Date: ${formatDate(old.author.time, old.author.tz)}`);
  printSummary(ctx, treeDiffStat(repo, commitFiles(repo, old.parents[0] ?? null), commitFiles(repo, oid)), false);
  const pushed = Object.entries(repo.refs.remotes).some(([, refs]) => Object.values(refs).some((o) => o === head || isAncestor(repo, head, o)));
  if (pushed) ctx.hint('このコミットはすでに push 済みです。amend すると別のコミットに置き換わるため、push には --force が必要になり、チームの履歴を壊すおそれがあります。');
}
