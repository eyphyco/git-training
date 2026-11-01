import { fail, type CommandDef } from '../command';
import { currentBranch, headOid, isAncestor } from '../model/refs';
import { fetchRemote, remoteUrl, upstreamOf } from '../remote';
import { mergeInto } from './merge';

export const pull: CommandDef = {
  name: 'pull',
  spec: { short: { r: 'rebase' }, long: ['no-rebase', 'ff-only', 'no-ff', 'ff'] },
  run(ctx) {
    const repo = ctx.repo;
    const { opts, positional } = ctx.args;
    if (opts.rebase) fail('このサイトでは git pull --rebase は未対応です。', '第6章（rebase）で扱います。今は git pull（fetch + merge）を使いましょう。');
    if (repo.inProgress) fail("error: You have not concluded your merge (MERGE_HEAD exists).\nhint: Please, commit your changes before merging.\nfatal: Exiting because of unfinished merge.", '前のマージが終わっていません。');
    const cur = currentBranch(repo);
    const up = upstreamOf(repo, cur);
    const remoteName = positional[0] ?? up?.remote;
    const branch = positional[1] ?? (positional[0] && positional[0] !== up?.remote ? undefined : up?.branch);
    if (!remoteName || !branch) {
      fail(
        `There is no tracking information for the current branch.\nPlease specify which branch you want to merge with.\nSee git-pull(1) for details.\n\n    git pull <remote> <branch>\n\nIf you wish to set tracking information for this branch you can do so with:\n\n    git branch --set-upstream-to=origin/<branch> ${cur ?? ''}\n`,
        'このブランチには追跡先（upstream）がありません。git pull origin main のように指定するか、git push -u で設定しましょう。',
      );
    }
    fetchRemote(ctx, remoteName);
    const theirs = repo.refs.remotes[remoteName]?.[branch];
    if (!theirs) fail(`fatal: couldn't find remote ref ${branch}`);
    const ours = headOid(repo);
    if (ours && !isAncestor(repo, ours, theirs) && !isAncestor(repo, theirs, ours) && !opts['ff-only'])
      ctx.hint('メモ: 新しい Git では、分岐した状態の pull は pull.rebase の設定を求めてきます。このサイトでは git config pull.rebase false（merge する）を設定済みとして動きます。');
    mergeInto(ctx, theirs, `${remoteName}/${branch}`, {
      ffOnly: !!opts['ff-only'],
      noFf: !!opts['no-ff'],
      defaultMessage: `Merge branch '${branch}' of ${remoteUrl(repo, remoteName).replace(/\.git$/, '')}`,
      label: theirs,
    });
  },
};
