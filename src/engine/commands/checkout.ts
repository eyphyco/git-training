import { fail, type CommandDef } from '../command';
import { getCommit, short, subject } from '../model/objects';
import { currentBranch, resolveRev } from '../model/refs';
import { restorePaths } from './restore';
import { createBranchAndSwitch, dwimTrackingBranch, moveHead } from './switch';

const MODERN = 'ヒント: 今の Git では、ブランチの移動は git switch、ファイルの取り消しは git restore に分かれています。';

export const checkout: CommandDef = {
  name: 'checkout',
  spec: { short: { b: 'new-branch', B: 'force-new-branch' }, long: ['detach'] },
  run(ctx) {
    const repo = ctx.repo;
    const { opts, positional, afterDashDash } = ctx.args;
    if (afterDashDash) {
      restorePaths(ctx, afterDashDash, { staged: !!positional[0], worktree: true, source: positional[0] });
      ctx.hint(MODERN);
      return;
    }
    const [name, start] = positional;
    if (opts['new-branch'] || opts['force-new-branch']) {
      createBranchAndSwitch(ctx, name, start, 'checkout');
      ctx.hint(MODERN);
      return;
    }
    if (!name) fail('fatal: you must specify a branch or path', MODERN);
    if (repo.refs.heads[name] && !opts.detach) {
      if (name === currentBranch(repo)) ctx.out(`Already on '${name}'`);
      else {
        moveHead(ctx, { branch: name }, 'checkout');
        ctx.out(`Switched to branch '${name}'`);
      }
      ctx.hint(MODERN);
      return;
    }
    if (!repo.refs.heads[name] && !opts.detach && dwimTrackingBranch(ctx, name, 'checkout')) return;
    const oid = resolveRev(repo, name);
    if (oid) {
      moveHead(ctx, { detach: oid }, 'checkout');
      ctx.out(`Note: switching to '${name}'.`);
      ctx.out('');
      ctx.out("You are in 'detached HEAD' state. You can look around, make experimental");
      ctx.out('changes and commit them, and you can discard any commits you make in this');
      ctx.out('state without impacting any branches by switching back to a branch.');
      ctx.out('');
      ctx.out(`HEAD is now at ${short(oid)} ${subject(getCommit(repo, oid).message)}`);
      ctx.hint('HEAD がブランチではなくコミットを直接指す「detached HEAD」になりました。git switch <ブランチ> で戻れます。');
      return;
    }
    // ブランチでもコミットでもなければファイルとして扱う（git checkout <file>）
    restorePaths(ctx, positional, { staged: false, worktree: true });
    ctx.out(`Updated ${positional.length} path${positional.length === 1 ? '' : 's'} from the index`);
    ctx.hint(MODERN);
  },
};
