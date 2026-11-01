import { fail, unsupported, type CommandDef } from '../command';
import { commitFiles, getBlob, getCommit, hashBlob, short, subject } from '../model/objects';
import { headOid, isValidBranchName, logRef, resolveRev } from '../model/refs';
import type { Head, Oid } from '../model/types';
import { cwdOf, failIfUsedElsewhere, resolvePath, stateAt, worktreePaths } from '../worktrees';
import { PROJECT_DIR } from './init';

export const worktree: CommandDef = {
  name: 'worktree',
  spec: { short: { b: 'branch', f: 'force' }, valued: ['branch'], long: ['force', 'detach'] },
  run(ctx) {
    const repo = ctx.repo;
    const { opts, positional } = ctx.args;
    const [sub, ...args] = positional;
    const cwd = cwdOf(repo);
    repo.worktrees ??= { cwd, others: {} };
    switch (sub) {
      case 'add': {
        const [pathArg, commitish] = args;
        if (!pathArg) fail('usage: git worktree add [-b <new-branch>] <path> [<commit-ish>]', '例: git worktree add ../hotfix（hotfix ブランチを作って ../hotfix に展開）');
        const path = resolvePath(cwd, pathArg);
        if (worktreePaths(repo).includes(path)) fail(`fatal: '${path}' already exists`, 'そのフォルダはもう作業フォルダとして使われています。');
        const name = path.split('/').pop()!;
        let head: Head;
        let oid: Oid;
        let label: string;
        const newBranch = (opts.branch as string | undefined) ?? (!commitish && !opts.detach ? name : undefined);
        if (newBranch) {
          if (!isValidBranchName(newBranch)) fail(`fatal: '${newBranch}' is not a valid branch name`);
          if (repo.refs.heads[newBranch]) {
            if (opts.branch) fail(`fatal: a branch named '${newBranch}' already exists`);
            // 同名のブランチがあれば、それを展開する
            failIfUsedElsewhere(repo, newBranch);
            if (newBranch === (repo.head.type === 'symbolic' ? repo.head.ref : null)) fail(`fatal: '${newBranch}' is already used by worktree at '${cwd}'`);
            oid = repo.refs.heads[newBranch];
            label = `checking out '${newBranch}'`;
          } else {
            const start = commitish ? resolveRev(repo, commitish) : headOid(repo);
            if (!start) fail(`fatal: invalid reference: ${commitish ?? 'HEAD'}`);
            oid = start;
            repo.refs.heads[newBranch] = oid;
            logRef(repo, `refs/heads/${newBranch}`, null, oid, `branch: Created from ${commitish ?? 'HEAD'}`, ctx.world.clock);
            ctx.emit({ type: 'BRANCH_CREATED', name: newBranch, oid });
            label = `new branch '${newBranch}'`;
          }
          head = { type: 'symbolic', ref: newBranch };
        } else {
          const ref = commitish ?? 'HEAD';
          if (repo.refs.heads[ref] && !opts.detach) {
            failIfUsedElsewhere(repo, ref);
            if (repo.head.type === 'symbolic' && repo.head.ref === ref) fail(`fatal: '${ref}' is already used by worktree at '${cwd}'`, `${ref} は今の作業フォルダで使っています。新しいブランチで作るなら -b を付けます。`);
            oid = repo.refs.heads[ref];
            head = { type: 'symbolic', ref };
            label = `checking out '${ref}'`;
          } else {
            const o = resolveRev(repo, ref);
            if (!o) fail(`fatal: invalid reference: ${ref}`);
            oid = o;
            head = { type: 'detached', oid };
            label = `detached HEAD ${short(oid)}`;
          }
        }
        const files = commitFiles(repo, oid);
        repo.worktrees.others[path] = { head, index: { ...files }, workingTree: Object.fromEntries(Object.entries(files).map(([p, o]) => [p, getBlob(repo, o)])) };
        ctx.out(`Preparing worktree (${label})`);
        ctx.out(`HEAD is now at ${short(oid)} ${subject(getCommit(repo, oid).message)}`);
        ctx.hint(`作業フォルダ ${path} を作りました。cd ${pathArg} で移動して作業できます（コミットやブランチは共有されます）。`);
        return;
      }
      case 'list': {
        const paths = worktreePaths(repo);
        const w = Math.max(...paths.map((p) => p.length));
        for (const p of paths) {
          const st = stateAt(repo, p)!;
          const oid = st.head.type === 'detached' ? st.head.oid : repo.refs.heads[st.head.ref];
          ctx.out(`${p.padEnd(w)}  ${oid ? short(oid) : '0000000'} ${st.head.type === 'symbolic' ? `[${st.head.ref}]` : '(detached HEAD)'}`);
        }
        return;
      }
      case 'remove': {
        const path = args[0] ? resolvePath(cwd, args[0]) : '';
        if (!path) fail('usage: git worktree remove [--force] <worktree>');
        if (path === PROJECT_DIR) fail(`fatal: '${path}' is a main working tree`, '元のフォルダ（.git があるフォルダ）は消せません。');
        if (path === cwd) fail(`fatal: '${path}' is the current working tree`, 'ほかのフォルダに cd してから消します。');
        const st = repo.worktrees.others[path];
        if (!st) fail(`fatal: '${args[0]}' is not a working tree`);
        const headFiles = commitFiles(repo, st.head.type === 'detached' ? st.head.oid : repo.refs.heads[st.head.ref]);
        const dirty = Object.keys({ ...st.workingTree, ...headFiles, ...st.index }).some((p) => st.index[p] !== headFiles[p] || (p in st.workingTree ? hashBlob(st.workingTree[p]) : undefined) !== st.index[p]);
        if (dirty && !opts.force) fail(`fatal: '${args[0]}' contains modified or untracked files, use --force to delete it`, '作業フォルダに未コミットの変更があります。消してよければ --force を付けます。');
        delete repo.worktrees.others[path];
        ctx.hint(`作業フォルダ ${path} を消しました（ブランチは残っています）。`);
        return;
      }
      case 'prune':
        return;
      default:
        unsupported(`git worktree ${sub ?? ''}`.trim(), 'add / list / remove が使えます');
    }
  },
};
