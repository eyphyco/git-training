import { fail, type CommandDef } from '../command';
import { resolveRev } from '../model/refs';
import { abortSequence, continueSequence, runSequence, sequenceOf, skipSequence, startSequence } from '../sequencer';
import { computeStatus } from '../model/status';

/** cherry-pick と revert の共通部分 */
export function pickCommand(op: 'cherry-pick' | 'revert'): CommandDef {
  return {
    name: op,
    spec: { short: { n: 'no-commit', e: 'edit', m: 'mainline', ...(op === 'cherry-pick' ? { x: 'x' } : {}) }, valued: ['mainline'], long: ['continue', 'abort', 'skip', 'no-edit', 'quit'] },
    run(ctx) {
      const { opts, positional } = ctx.args;
      if (opts.continue) return continueSequence(ctx, op);
      if (opts.abort) return abortSequence(ctx, op);
      if (opts.skip) return skipSequence(ctx, op);
      if (opts['no-commit'] || opts.mainline || opts.edit)
        fail(`このサイトでは ${op} の ${opts['no-commit'] ? '-n' : opts.mainline ? '-m' : '-e'} は未対応です。`, opts.mainline ? '実 Git ではマージコミットに対して -m 1 で基準の親を選びます。' : `git ${op} <コミット> の形で使ってください。`);
      if (ctx.repo.inProgress)
        fail(`error: ${sequenceOf(ctx) ? `${ctx.repo.inProgress.op} is already in progress` : 'You have not concluded your merge (MERGE_HEAD exists).'}\nhint: try "git ${ctx.repo.inProgress.op} (--continue | --abort)"\nfatal: ${op} failed`, '前の操作が途中です。--continue で続けるか --abort で中止してください。');
      if (!positional.length) fail(`usage: git ${op} [<options>] <commit-ish>...`, `${op === 'revert' ? '打ち消したい' : 'コピーしたい'}コミットを指定します（例: git ${op} abc1234）`);
      const oids = positional.map((rev) => {
        const oid = resolveRev(ctx.repo, rev);
        if (!oid) fail(`fatal: bad revision '${rev}'`, `「${rev}」というコミットは見つかりません。git log --oneline で確かめましょう。`);
        return oid;
      });
      if (computeStatus(ctx.repo).staged.length)
        fail(`error: your local changes would be overwritten by ${op}.\nhint: commit your changes or stash them to proceed.\nfatal: ${op} failed`, 'ステージに未コミットの変更があります。先にコミットするか git stash で退避しましょう。');
      startSequence(ctx, op, oids.map((oid) => ({ action: 'pick', oid })), opts.x ? { recordOrigin: true } : {});
      runSequence(ctx);
    },
  };
}

export const revert = pickCommand('revert');
