import { cwdOf, usedElsewhere } from '../worktrees';
import { fail, type CommandDef } from '../command';
import { getCommit, short, subject } from '../model/objects';
import { currentBranch, headOid, isAncestor, isValidBranchName, logRef, resolveRev } from '../model/refs';
import { aheadBehind, setUpstream, upstreamOf } from '../remote';

export const branch: CommandDef = {
  name: 'branch',
  spec: { short: { d: 'delete', D: 'force-delete', m: 'move', v: 'verbose', a: 'all', r: 'remotes', f: 'force', u: 'set-upstream-to' }, valued: ['set-upstream-to'], long: ['unset-upstream'] },
  run(ctx) {
    const repo = ctx.repo;
    const { opts, positional } = ctx.args;
    const cur = currentBranch(repo);

    if (opts.delete || opts['force-delete']) {
      if (!positional.length) fail('fatal: branch name required');
      for (const name of positional) {
        const oid = repo.refs.heads[name];
        if (!oid) fail(`error: branch '${name}' not found`, `「${name}」というブランチはありません。git branch で一覧を確認しましょう。`);
        if (name === cur) fail(`error: cannot delete branch '${name}' used by worktree at '${cwdOf(repo)}'`, '今いるブランチは消せません。別のブランチに switch してから消します。');
        const elsewhere = usedElsewhere(repo, name);
        if (elsewhere) fail(`error: cannot delete branch '${name}' used by worktree at '${elsewhere}'`, `${name} はほかの作業フォルダで使われています。git worktree remove してから消します。`);
        const head = headOid(repo);
        if (!opts['force-delete'] && (!head || !isAncestor(repo, oid, head)))
          fail(`error: the branch '${name}' is not fully merged\nhint: If you are sure you want to delete it, run 'git branch -D ${name}'`, 'まだマージされていないコミットがあるため消せません（消すとそのコミットに辿り着けなくなります）。');
        delete repo.refs.heads[name];
        if (repo.config.branches) delete repo.config.branches[name];
        ctx.out(`Deleted branch ${name} (was ${short(oid)}).`);
        ctx.emit({ type: 'BRANCH_DELETED', name, oid });
      }
      return;
    }

    if (opts['set-upstream-to']) {
      const target = opts['set-upstream-to'] as string;
      const name = positional[0] ?? cur;
      if (!name || !repo.refs.heads[name]) fail(`fatal: branch '${name}' does not exist`);
      const slash = target.indexOf('/');
      const [r, b] = [target.slice(0, slash), target.slice(slash + 1)];
      if (slash < 0 || !repo.refs.remotes[r]?.[b]) fail(`fatal: the requested upstream branch '${target}' does not exist`, `「${target}」がありません。先に git fetch で取得しましょう。`);
      setUpstream(repo, name, r, b);
      ctx.out(`branch '${name}' set up to track '${target}'.`);
      ctx.emit({ type: 'UPSTREAM_SET', branch: name, upstream: target });
      return;
    }
    if (opts['unset-upstream']) {
      const name = positional[0] ?? cur;
      if (!name || !repo.config.branches?.[name]) fail(`fatal: branch '${name}' has no upstream information`);
      delete repo.config.branches[name];
      return;
    }

    if (opts.move) {
      const [a, b] = positional.length === 1 ? [cur, positional[0]] : positional;
      if (!a || !b) fail('fatal: branch name required');
      if (!repo.refs.heads[a] && a !== cur) fail(`error: refname refs/heads/${a} not found`);
      if (repo.refs.heads[b] && !opts.force) fail(`fatal: a branch named '${b}' already exists`);
      if (!isValidBranchName(b)) fail(`fatal: '${b}' is not a valid branch name`);
      if (repo.refs.heads[a]) {
        repo.refs.heads[b] = repo.refs.heads[a];
        delete repo.refs.heads[a];
      }
      if (cur === a) repo.head = { type: 'symbolic', ref: b };
      ctx.emit({ type: 'BRANCH_RENAMED', from: a, to: b });
      return;
    }

    if (!positional.length) {
      if (repo.head.type === 'detached') ctx.out(`* (HEAD detached at ${short(repo.head.oid)})`, 'green');
      const rows: [string, string, boolean][] = Object.keys(repo.refs.heads).sort().map((n) => [n, repo.refs.heads[n], n === cur]);
      if (opts.all || opts.remotes) {
        if (opts.remotes) rows.length = 0;
        for (const [r, refs] of Object.entries(repo.refs.remotes))
          for (const [b, o] of Object.entries(refs)) rows.push([`remotes/${r}/${b}`, o, false]);
      }
      const w = Math.max(0, ...rows.map(([n]) => n.length));
      for (const [n, o, isCur] of rows) {
        let track = '';
        const up = n.startsWith('remotes/') ? null : upstreamOf(repo, n);
        if (up && ctx.raw.includes('-vv')) {
          const theirs = repo.refs.remotes[up.remote]?.[up.branch];
          const ab = theirs ? aheadBehind(repo, o, theirs) : null;
          const parts = !ab ? ['gone'] : [ab.ahead ? `ahead ${ab.ahead}` : '', ab.behind ? `behind ${ab.behind}` : ''].filter(Boolean);
          track = `[${up.ref}${parts.length ? `: ${parts.join(', ')}` : ''}] `;
        }
        const text = opts.verbose ? `${n.padEnd(w)} ${short(o)} ${track}${subject(getCommit(repo, o).message)}` : n;
        ctx.out(`${isCur ? '* ' : '  '}${text}`, isCur ? 'green' : n.startsWith('remotes/') ? 'red' : 'normal');
      }
      return;
    }

    const [name, start] = positional;
    if (!isValidBranchName(name)) fail(`fatal: '${name}' is not a valid branch name`, 'ブランチ名に空白や ~ ^ : などは使えません。例: feature/login');
    if (repo.refs.heads[name] && !opts.force) fail(`fatal: a branch named '${name}' already exists`, `「${name}」は既にあります。移動するなら git switch ${name} です。`);
    const oid = start ? resolveRev(repo, start) : headOid(repo);
    if (!oid) {
      if (!start) fail(`fatal: not a valid object name: '${cur}'`, 'まだコミットがないのでブランチを作れません。先に1つコミットしましょう。');
      fail(`fatal: not a valid object name: '${start}'`, `「${start}」というコミットやブランチは見つかりません。`);
    }
    repo.refs.heads[name] = oid;
    logRef(repo, `refs/heads/${name}`, null, oid, `branch: Created from ${start ?? 'HEAD'}`, ctx.world.clock);
    ctx.emit({ type: 'BRANCH_CREATED', name, oid });
  },
};
