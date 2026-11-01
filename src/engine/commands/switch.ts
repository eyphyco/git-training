import { fail, type Ctx, type CommandDef } from '../command';
import { commitFiles, getCommit, short, subject } from '../model/objects';
import { currentBranch, headOid, isValidBranchName, logRef, resolveRev } from '../model/refs';
import type { Oid } from '../model/types';
import { checkoutTree } from '../worktree';

const headLabel = (ctx: Ctx) => currentBranch(ctx.repo) ?? short(headOid(ctx.repo)!);

/** HEAD をブランチ（または detached でコミット）に切り替える。switch と checkout の共通処理 */
export function moveHead(ctx: Ctx, target: { branch: string } | { detach: Oid }, verb: string) {
  const repo = ctx.repo;
  const fromLabel = headLabel(ctx);
  const from = headOid(repo);
  const to = 'branch' in target ? (repo.refs.heads[target.branch] ?? null) : target.detach;
  checkoutTree(repo, commitFiles(repo, from), commitFiles(repo, to), 'checkout');
  repo.head = 'branch' in target ? { type: 'symbolic', ref: target.branch } : { type: 'detached', oid: target.detach };
  if (to) logRef(repo, 'HEAD', from, to, `${verb}: moving from ${fromLabel} to ${'branch' in target ? target.branch : short(to)}`, ctx.world.clock);
  ctx.emit({ type: 'HEAD_MOVED', from: fromLabel, to: 'branch' in target ? target.branch : short(to!), detached: !('branch' in target) });
}

export function createBranchAndSwitch(ctx: Ctx, name: string, start: string | undefined, verb: string) {
  const repo = ctx.repo;
  if (!isValidBranchName(name)) fail(`fatal: '${name}' is not a valid branch name`, 'ブランチ名に空白や ~ ^ : などは使えません。');
  if (repo.refs.heads[name]) fail(`fatal: a branch named '${name}' already exists`, `「${name}」は既にあります。移動するだけなら git switch ${name} です。`);
  const oid = start ? resolveRev(repo, start) : headOid(repo);
  if (start && !oid) fail(`fatal: invalid reference: ${start}`);
  const fromLabel = headLabel(ctx);
  if (oid) {
    const from = headOid(repo);
    checkoutTree(repo, commitFiles(repo, from), commitFiles(repo, oid), 'checkout');
    repo.refs.heads[name] = oid;
    logRef(repo, `refs/heads/${name}`, null, oid, `branch: Created from ${start ?? 'HEAD'}`, ctx.world.clock);
    logRef(repo, 'HEAD', from, oid, `${verb}: moving from ${fromLabel} to ${name}`, ctx.world.clock);
    ctx.emit({ type: 'BRANCH_CREATED', name, oid });
  }
  // まだコミットがない状態での -c は、生まれていないブランチ名を付け替えるだけ
  repo.head = { type: 'symbolic', ref: name };
  ctx.emit({ type: 'HEAD_MOVED', from: fromLabel, to: name, detached: false });
  ctx.out(`Switched to a new branch '${name}'`);
}

export const switchCmd: CommandDef = {
  name: 'switch',
  spec: { short: { c: 'create', C: 'force-create', d: 'detach' }, long: ['detach'] },
  run(ctx) {
    const repo = ctx.repo;
    const { opts, positional } = ctx.args;
    const [name, start] = positional;
    if (!name && !opts.detach) fail('fatal: missing branch or commit argument', '移動先のブランチ名を指定してください（例: git switch main）');
    if (opts.create || opts['force-create']) return createBranchAndSwitch(ctx, name, start, 'switch');
    if (opts.detach) {
      const oid = resolveRev(repo, name ?? 'HEAD');
      if (!oid) fail(`fatal: invalid reference: ${name}`);
      moveHead(ctx, { detach: oid }, 'checkout');
      ctx.out(`HEAD is now at ${short(oid)} ${subject(getCommit(repo, oid).message)}`);
      return;
    }
    if (name === currentBranch(repo)) {
      ctx.out(`Already on '${name}'`);
      return;
    }
    if (!repo.refs.heads[name]) {
      if (resolveRev(repo, name))
        fail(`fatal: a branch is expected, got commit '${name}'\nhint: If you want to detach HEAD at the commit, try again with the --detach option.`, 'コミットに直接移動するには git switch --detach <コミット> と書きます。');
      fail(`fatal: invalid reference: ${name}`, `「${name}」というブランチはありません。作るなら git switch -c ${name} です。`);
    }
    moveHead(ctx, { branch: name }, 'checkout');
    ctx.out(`Switched to branch '${name}'`);
  },
};
