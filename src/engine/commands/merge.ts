import { fail, type CommandDef, type Ctx } from '../command';
import { mergeTrees } from '../merge/tree3';
import { commitFiles, getBlob, short } from '../model/objects';
import { currentBranch, headOid, isAncestor, mergeBase, resolveRev, setBranch, logRef } from '../model/refs';
import { computeStatus } from '../model/status';
import type { Oid, Path } from '../model/types';
import { printSummary, treeDiffStat } from '../stat';
import { applyTree, checkoutTree, findOverwrites } from '../worktree';
import { cleanupMessage, commitIndex } from './commit';

export const merge: CommandDef = {
  name: 'merge',
  spec: { short: { m: 'message' }, multiple: ['message'], long: ['no-ff', 'ff-only', 'ff', 'abort', 'continue', 'no-edit', 'squash', 'no-commit'] },
  run(ctx) {
    const repo = ctx.repo;
    const { opts, positional } = ctx.args;

    if (opts.abort) {
      const ip = repo.inProgress;
      if (ip?.op !== 'merge') fail('fatal: There is no merge to abort (MERGE_HEAD missing).', '今はマージ中ではありません。');
      const head = commitFiles(repo, headOid(repo));
      for (const p of ip.affected) {
        if (head[p]) {
          repo.index[p] = head[p];
          repo.workingTree[p] = getBlob(repo, head[p]);
        } else {
          delete repo.index[p];
          delete repo.workingTree[p];
        }
      }
      delete repo.inProgress;
      ctx.emit({ type: 'MERGE_ABORTED' });
      return;
    }
    if (opts.continue) {
      if (repo.inProgress?.op !== 'merge') fail('fatal: There is no merge in progress (MERGE_HEAD missing).');
      fail('', 'マージを完了するには git commit を実行します（このサイトでは merge --continue の代わりに commit を使ってください）。');
    }
    if (opts.squash || opts['no-commit']) fail(`このサイトでは merge --${opts.squash ? 'squash' : 'no-commit'} は未対応です。`, 'squash マージは第5章の模擬 GitHub で扱います。');
    if (repo.inProgress) fail('error: Merging is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use \'git add/rm <file>\'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.', '前のマージが終わっていません。コンフリクトを解消してコミットするか、git merge --abort で中止します。');

    const name = positional[0];
    if (!name) fail('fatal: No remote for the current branch.', '取り込みたいブランチ名を指定してください（例: git merge feature）');
    const theirs = resolveRev(repo, name);
    if (!theirs) fail(`merge: ${name} - not something we can merge`, `「${name}」というブランチやコミットはありません。git branch で確認しましょう。`);
    mergeInto(ctx, theirs, name, {
      noFf: !!opts['no-ff'],
      ffOnly: !!opts['ff-only'],
      messages: opts.message as string[] | undefined,
    });
  },
};

export type MergeOptions = {
  noFf?: boolean;
  ffOnly?: boolean;
  messages?: string[];
  /** 既定のマージコミットメッセージ（git pull では "Merge branch 'main' of <url>"） */
  defaultMessage?: string;
  /** 衝突マーカー >>>>>>> の後ろに付く名前 */
  label?: string;
};

/** 今の HEAD に theirs を取り込む（merge と pull の共通処理） */
export function mergeInto(ctx: Ctx, theirs: Oid, name: string, mo: MergeOptions) {
  const repo = ctx.repo;
  const ours = headOid(repo);
  const branch = currentBranch(repo);
  if (!ours) fail('fatal: このサイトでは、コミットのないブランチへのマージは未対応です。', '先に1つコミットを作ってからマージしましょう。');

  if (isAncestor(repo, theirs, ours)) {
    ctx.out('Already up to date.');
    return;
  }
  const oursFiles = commitFiles(repo, ours);
  const theirsFiles = commitFiles(repo, theirs);

  // fast-forward：今のブランチを相手の位置まで進めるだけ
  if (isAncestor(repo, ours, theirs) && !mo.noFf) {
    checkoutTree(repo, oursFiles, theirsFiles, 'merge');
    ctx.out(`Updating ${short(ours)}..${short(theirs)}`);
    ctx.out('Fast-forward');
    if (branch) setBranch(repo, branch, theirs, `merge ${name}: Fast-forward`, ctx.world.clock);
    else {
      repo.head = { type: 'detached', oid: theirs };
      logRef(repo, 'HEAD', ours, theirs, `merge ${name}: Fast-forward`, ctx.world.clock);
    }
    printSummary(ctx, treeDiffStat(repo, oursFiles, theirsFiles), true);
    ctx.emit({ type: 'MERGE_FAST_FORWARD', branch: branch ?? 'HEAD', from: ours, to: theirs });
    ctx.emit({ type: 'REF_MOVED', ref: branch ?? 'HEAD', from: ours, to: theirs, reason: 'fast-forward' });
    return;
  }
  if (mo.ffOnly) fail('hint: Diverging branches can\'t be fast-forwarded, you need to either:\nhint:\nhint: \tgit merge --no-ff\nhint:\nhint: or:\nhint:\nhint: \tgit rebase\nhint:\nfatal: Not possible to fast-forward, aborting.', '両方のブランチに新しいコミットがあるため fast-forward できません。');

  // 3-way マージ（ファイル単位で判定し、両方が変えたファイルだけ行単位で diff3）
  const base = mergeBase(repo, ours, theirs);
  const { result, conflictText, conflicts, lines } = mergeTrees(repo, commitFiles(repo, base), oursFiles, theirsFiles, { ours: 'HEAD', theirs: mo.label ?? name });
  const message = mo.messages?.length
    ? cleanupMessage(mo.messages)
    : (mo.defaultMessage ?? `Merge branch '${name}'`) + (branch && !['main', 'master'].includes(branch) ? ` into ${branch}` : '');

  // 影響するファイルにローカル変更があれば中断（実 Git と同じく作業を守る）
  const target: Record<Path, string> = { ...result };
  for (const p of conflicts) target[p] = `conflict:${p}`; // マーカーを書き込むので必ず「変わる」扱い
  const bad = findOverwrites(repo, oursFiles, target);
  if (!bad.length) bad.push(...computeStatus(repo).staged.map((s) => s.path));
  if (bad.length)
    fail(`error: Your local changes to the following files would be overwritten by merge:\n${bad.map((p) => `\t${p}`).join('\n')}\nPlease commit your changes or stash them before you merge.\nAborting`, 'マージで書き換わるファイルか、ステージに未コミットの変更があります。先にコミットしましょう。');

  const affected = applyTree(repo, oursFiles, result);
  for (const l of lines) ctx.out(l, l.startsWith('CONFLICT') ? 'red' : 'normal');
  if (conflicts.length) {
    for (const p of conflicts) if (conflictText[p] !== undefined) repo.workingTree[p] = conflictText[p];
    repo.inProgress = { op: 'merge', theirs, theirsName: name, message, conflicts, affected: [...new Set([...affected, ...conflicts])] };
    ctx.out('Automatic merge failed; fix conflicts and then commit the result.');
    ctx.hint(`コンフリクト（衝突）が起きました。${conflicts.join(', ')} の <<<<<<< 〜 >>>>>>> の部分を直して git add → git commit します。やめるなら git merge --abort。`);
    ctx.emit({ type: 'CONFLICT', paths: conflicts, theirs: name });
    return;
  }
  const oid = commitIndex(ctx, message, [ours, theirs], `merge ${name}`);
  ctx.out("Merge made by the 'ort' strategy.");
  printSummary(ctx, treeDiffStat(repo, oursFiles, commitFiles(repo, oid)), true);
  ctx.emit({ type: 'MERGE_COMMIT', oid, theirs: name });
}
