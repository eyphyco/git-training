import { fail, unsupported, type CommandDef } from '../command';
import { commitFiles, getBlob, getCommit, hashBlob, short, subject } from '../model/objects';
import { ancestors, currentBranch, headOid, resolveRev } from '../model/refs';
import type { Oid } from '../model/types';
import { moveHead } from './commit';
import { restorePaths } from './restore';

export const reset: CommandDef = {
  name: 'reset',
  spec: { short: { q: 'quiet' }, long: ['soft', 'mixed', 'hard', 'keep', 'merge'] },
  run(ctx) {
    const repo = ctx.repo;
    const { opts, positional, afterDashDash } = ctx.args;
    if (opts.keep || opts.merge) unsupported(`reset --${opts.keep ? 'keep' : 'merge'}`, 'ローカルの変更を残しながら reset します');
    const mode = opts.soft ? 'soft' : opts.hard ? 'hard' : 'mixed';
    const head = headOid(repo);
    if (!head) fail("fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.", 'まだコミットがないので reset できません。');

    // git reset <path> / git reset HEAD -- <path>：ステージから外すだけ（ブランチは動かない）
    const first = positional[0];
    const firstIsRev = first !== undefined && resolveRev(repo, first) !== null;
    const paths = [...(firstIsRev ? positional.slice(1) : positional), ...(afterDashDash ?? [])];
    const known = (p: string) => p in repo.index || p in repo.workingTree || p in commitFiles(repo, head) || Object.keys(repo.index).some((q) => q.startsWith(`${p.replace(/\/$/, '')}/`));
    if (!afterDashDash && paths.some((p) => !known(p)))
      fail(`fatal: ambiguous argument '${paths.find((p) => !known(p))}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`, `「${paths.find((p) => !known(p))}」というコミットやファイルは見つかりません。git log --oneline や git reflog で確かめましょう。`);
    if (paths.length) {
      if (opts.soft || opts.hard) fail(`fatal: Cannot do ${mode} reset with paths.`, 'ファイル指定の reset はステージから外すだけです。--soft / --hard は付けません。');
      restorePaths(ctx, paths, { staged: true, worktree: false, source: firstIsRev ? first : undefined });
      return;
    }

    const rev = first ?? 'HEAD';
    const target = resolveRev(repo, rev);
    if (!target)
      fail(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`, `「${rev}」というコミットやファイルは見つかりません。git log --oneline で確かめましょう。`);
    if (mode === 'soft' && repo.inProgress?.op === 'merge') fail('fatal: Cannot do a soft reset in the middle of a merge.');

    const from = commitFiles(repo, head);
    const to = commitFiles(repo, target);
    if (mode !== 'soft') {
      // ステージを target の内容にする
      const before = { ...repo.index };
      repo.index = { ...to };
      if (mode === 'hard') {
        for (const p of new Set([...Object.keys(before), ...Object.keys(from), ...Object.keys(to)])) {
          if (to[p]) repo.workingTree[p] = getBlob(repo, to[p]);
          else delete repo.workingTree[p];
        }
      }
      if (repo.inProgress && repo.inProgress.op !== 'rebase') delete repo.inProgress;
      else if (repo.inProgress) repo.inProgress.conflicts = [];
    }
    // ブランチから辿れなくなるコミット（reflog でしか戻れない）
    const kept = ancestors(repo, target);
    const lost: Oid[] = [];
    for (let o: Oid | undefined = head; o && !kept.has(o); o = getCommit(repo, o).parents[0]) lost.push(o);

    moveHead(ctx, target, `reset: moving to ${rev}`);
    ctx.emit({ type: 'RESET', mode, ref: currentBranch(repo) ?? 'HEAD', from: head, to: target, lost });

    if (opts.quiet) return;
    if (mode === 'hard') ctx.out(`HEAD is now at ${short(target)} ${subject(getCommit(repo, target).message)}`);
    if (mode === 'mixed') {
      const changed = Object.keys({ ...repo.index, ...repo.workingTree })
        .filter((p) => p in repo.index || p in to)
        .filter((p) => repo.workingTree[p] === undefined || hashBlob(repo.workingTree[p]) !== repo.index[p])
        .sort();
      if (changed.length) {
        ctx.out('Unstaged changes after reset:');
        for (const p of changed) ctx.out(`${p in repo.workingTree ? 'M' : 'D'}\t${p}`);
      }
    }
    if (lost.length && mode === 'hard')
      ctx.hint(`実務ではここで事故になりがちです：${lost.length} 個のコミットがどのブランチからも辿れなくなりました。戻したいときは git reflog で ID を探して git reset --hard HEAD@{1} のようにします。`);
    else if (lost.length) ctx.hint(`${lost.length} 個のコミットを取り消しました。変更は${mode === 'soft' ? 'ステージ' : 'ワークツリー'}に残っています。`);
  },
};
