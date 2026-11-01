import { fail, type CommandDef } from '../command';
import { isAncestor, currentBranch, resolveRev } from '../model/refs';
import type { RefUpdate } from '../model/types';
import { copyObjects, hostedRepo, refLine, remoteUrl, setUpstream, upstreamOf } from '../remote';

export const push: CommandDef = {
  name: 'push',
  spec: { short: { u: 'set-upstream', f: 'force', d: 'delete' }, long: ['force-with-lease', 'all'] },
  run(ctx) {
    const repo = ctx.repo;
    const { opts, positional } = ctx.args;
    const cur = currentBranch(repo);
    const up = upstreamOf(repo, cur);
    let [remoteName, spec] = positional;
    if (!remoteName) {
      if (!cur) fail('fatal: You are not currently on a branch.', 'detached HEAD では push する先のブランチ名を指定します。');
      if (!up) {
        const r = Object.keys(repo.config.remotes ?? {})[0];
        if (!r) fail("fatal: No configured push destination.\nEither specify the URL from the command-line or configure a remote repository using\n\n    git remote add <name> <url>\n\nand then push using the remote name\n\n    git push <name>", 'まだリモートが登録されていません。git remote add origin <URL> で登録しましょう。');
        fail(`fatal: The current branch ${cur} has no upstream branch.\nTo push the current branch and set the remote as upstream, use\n\n    git push --set-upstream ${r} ${cur}\n`, `初めて push するブランチは git push -u ${r} ${cur} で「追跡先」も一緒に設定します。`);
      }
      remoteName = up.remote;
      spec = `${cur}:${up.branch}`;
    }
    const remote = hostedRepo(ctx, remoteName);
    if (!spec) {
      if (!cur) fail('fatal: You are not currently on a branch.');
      spec = up && up.remote === remoteName ? `${cur}:${up.branch}` : cur;
    }
    const [src, dst = src.replace(/^refs\/heads\//, '')] = spec.replace(/^\+/, '').split(':');
    const forced = !!opts.force || !!opts['force-with-lease'] || spec.startsWith('+');
    const url = remoteUrl(repo, remoteName);
    const updates: RefUpdate[] = [];

    // GitHub のブランチ保護（hosting 層の設定。origin だけが対象）
    const protection = remoteName === 'origin' ? ctx.world.hosting.protections.find((p) => p.branch === (opts.delete ? src : dst)) : undefined;
    const rejectProtected = (reason: string, ja: string) => {
      ctx.out('remote: error: GH006: Protected branch update failed for refs/heads/' + (opts.delete ? src : dst) + '.', 'red');
      ctx.out('remote: ');
      ctx.out(`remote: - ${reason}`, 'red');
      ctx.out(`To ${url}`);
      ctx.out(` ! [remote rejected] ${opts.delete ? `(delete)` : src} -> ${opts.delete ? src : dst} (protected branch hook declined)`, 'red');
      ctx.emit({ type: 'PUSH_PROTECTED', branch: opts.delete ? src : dst, reason });
      fail(`error: failed to push some refs to '${url}'`, ja);
    };
    if (protection && (opts.delete || src === '')) rejectProtected('Cannot delete this branch', '保護されたブランチは削除できません。');

    if (opts.delete || src === '') {
      const name = opts.delete ? src : dst;
      const old = remote.refs.heads[name];
      if (!old) fail(`error: unable to delete '${name}': remote ref does not exist\nerror: failed to push some refs to '${url}'`);
      delete remote.refs.heads[name];
      if (repo.refs.remotes[remoteName]) delete repo.refs.remotes[remoteName][name];
      ctx.out(`To ${url}`);
      ctx.out(refLine({ ref: name, from: old, to: null }, '', name));
      updates.push({ ref: name, from: old, to: null });
      ctx.emit({ type: 'PUSHED', remote: remoteName, updates });
      return;
    }

    const oid = resolveRev(repo, src);
    if (!oid) fail(`error: src refspec ${src} does not match any\nerror: failed to push some refs to '${url}'`, src === cur ? 'まだコミットがありません。先にコミットしてから push します。' : `「${src}」というブランチはありません。`);
    const old = remote.refs.heads[dst] ?? null;
    if (old === oid) {
      ctx.out('Everything up-to-date');
    } else {
      if (old && !forced && !(repo.objects[old] && isAncestor(repo, old, oid))) {
        const known = !!repo.objects[old];
        const reason = known ? 'non-fast-forward' : 'fetch first';
        ctx.out(`To ${url}`);
        ctx.out(` ! [rejected]        ${src} -> ${dst} (${reason})`, 'red');
        fail(
          `error: failed to push some refs to '${url}'\n` +
            (known
              ? "hint: Updates were rejected because the tip of your current branch is behind\nhint: its remote counterpart. If you want to integrate the remote changes,\nhint: use 'git pull' before pushing again."
              : "hint: Updates were rejected because the remote contains work that you do not\nhint: have locally. This is usually caused by another repository pushing to\nhint: the same ref. If you want to integrate the remote changes, use\nhint: 'git pull' before pushing again.") +
            "\nhint: See the 'Note about fast-forwards' in 'git push --help' for details.",
          'リモートに、あなたの手元にないコミットがあります（誰かが先に push しました）。git pull で取り込んでから、もう一度 push しましょう。',
        );
      }
      if (protection && old && !isAncestor(repo, old, oid)) rejectProtected('Cannot force-push to this branch', '保護されたブランチには force push できません。');
      if (protection?.requirePullRequest) rejectProtected('Changes must be made through a pull request.', `${dst} は保護されていて、直接 push できません。作業用のブランチを push して PR を作り、そこからマージします。`);
      copyObjects(repo, remote, [oid]);
      // 空のリポジトリに最初に push したブランチが既定ブランチになる（GitHub と同じ）
      if (!Object.keys(remote.refs.heads).length) remote.head = { type: 'symbolic', ref: dst };
      remote.refs.heads[dst] = oid;
      repo.refs.remotes[remoteName] = { ...(repo.refs.remotes[remoteName] ?? {}), [dst]: oid };
      const u: RefUpdate = { ref: dst, from: old, to: oid, forced: !!old && !isAncestor(repo, old, oid) };
      updates.push(u);
      if (!old && remoteName === 'origin' && /github\.com/.test(url) && Object.keys(remote.refs.heads).length > 1) {
        const slug = url.replace(/^.*github\.com[/:]/, '').replace(/\.git$/, '');
        ctx.out('remote: ');
        ctx.out(`remote: Create a pull request for '${dst}' on GitHub by visiting:`);
        ctx.out(`remote:      https://github.com/${slug}/pull/new/${dst}`);
        ctx.out('remote: ');
      }
      ctx.out(`To ${url}`);
      ctx.out(refLine(u, src, dst));
      if (u.forced) ctx.hint('⚠️ force push でリモートの履歴を上書きしました。他の人が持っているコミットが消えることがあり、チーム開発では原則禁止です。');
      ctx.emit({ type: 'PUSHED', remote: remoteName, updates });
    }
    if (opts['set-upstream'] && repo.refs.heads[src]) {
      setUpstream(repo, src, remoteName, dst);
      ctx.out(`branch '${src}' set up to track '${remoteName}/${dst}'.`);
      ctx.emit({ type: 'UPSTREAM_SET', branch: src, upstream: `${remoteName}/${dst}` });
    }
  },
};
