import { fail, unsupported, type CommandDef, type Ctx } from '../command';
import { commitFiles, short, subject, writeBlob, writeCommit, writeTree } from '../model/objects';
import { currentBranch, headOid, logRef, setBranch } from '../model/refs';
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
  ctx.emit({ type: 'COMMIT_CREATED', oid, parents: c.parents, branch, message: c.message });
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
  spec: { short: { m: 'message', a: 'all', q: 'quiet' }, multiple: ['message'], long: ['allow-empty', 'amend', 'no-edit'] },
  run(ctx) {
    const repo = ctx.repo;
    const { opts } = ctx.args;
    if (opts.amend) unsupported('commit --amend', '直前のコミットを作り直します（第6章で扱います）');
    if (ctx.args.positional.length) unsupported('パス指定付きの commit', 'git commit <path> は指定ファイルだけをコミットします。このサイトでは git add してから git commit してください');
    const merging = repo.inProgress?.op === 'merge' ? repo.inProgress : undefined;
    if (merging?.conflicts.length)
      fail(
        "error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.",
        'コンフリクトが残っています。ファイルを直して git add してからコミットしましょう。',
      );
    const messages = (opts.message as string[] | undefined) ?? [];
    if (!messages.length && !merging)
      fail('このサイトではエディタが開けないため、-m でメッセージを指定してください。', '例: git commit -m "README を追加"（実 Git では -m なしだとエディタが開きます）');
    const message = messages.length ? cleanupMessage(messages) : merging!.message;
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
    const parents = parent ? [parent] : [];
    if (merging) parents.push(merging.theirs);
    const before = commitFiles(repo, parent);
    const oid = commitIndex(ctx, message, parents, merging ? 'commit (merge)' : parent ? 'commit' : 'commit (initial)');
    if (merging) delete repo.inProgress;
    if (opts.quiet) return;
    const branch = currentBranch(repo);
    const label = branch ? `${branch}${parent ? '' : ' (root-commit)'}` : 'detached HEAD';
    ctx.out(`[${label} ${short(oid)}] ${subject(message)}`);
    printSummary(ctx, treeDiffStat(repo, before, commitFiles(repo, oid)), false);
  },
};
