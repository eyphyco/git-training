import { fail, unsupported, type CommandDef, type Ctx } from '../command';
import { commitFiles, short, subject, writeBlob, writeCommit, writeTree } from '../model/objects';
import { currentBranch, headOid, logRef, setBranch } from '../model/refs';
import { computeStatus } from '../model/status';
import type { Oid } from '../model/types';
import { printSummary, treeDiffStat } from '../stat';

/** インデックスの内容でコミットを作り、HEAD（またはそのブランチ）を進める */
export function commitIndex(ctx: Ctx, message: string, parents: Oid[], reflogMsg: string): Oid {
  const repo = ctx.repo;
  const tree = writeTree(repo, { ...repo.index });
  const time = ctx.tick();
  const who = { ...repo.config.user, time, tz: '+0900' };
  const oid = writeCommit(repo, { tree, parents, author: who, committer: who, message });
  const branch = currentBranch(repo);
  const old = headOid(repo);
  const msg = `${reflogMsg}: ${subject(message)}`;
  if (branch) setBranch(repo, branch, oid, msg, time);
  else {
    repo.head = { type: 'detached', oid };
    logRef(repo, 'HEAD', old, oid, msg, time);
  }
  ctx.emit({ type: 'COMMIT_CREATED', oid, parents, branch, message });
  ctx.emit({ type: 'REF_MOVED', ref: branch ?? 'HEAD', from: old, to: oid, reason: 'commit' });
  return oid;
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
