import { fail, unsupported, type CommandDef, type Ctx } from '../command';
import { mergeTrees } from '../merge/tree3';
import { commitFiles, getBlob, getCommit, hashBlob, short, subject, writeBlob, writeCommit, writeTree } from '../model/objects';
import { currentBranch, headOid, logRef } from '../model/refs';
import { computeStatus } from '../model/status';
import type { Oid, Path } from '../model/types';
import { printSummary, treeDiffStat } from '../stat';
import { applyTree } from '../worktree';
import { you } from './commit';
import { status } from './status';

const ref = (n: number) => `stash@{${n}}`;

function parseIndex(ctx: Ctx, arg?: string): number {
  const n = arg === undefined ? 0 : /^\d+$/.test(arg) ? Number(arg) : Number(arg.match(/^stash@\{(\d+)\}$/)?.[1] ?? NaN);
  if (!ctx.repo.stash.length) fail('No stash entries found.', '退避した変更（stash）がありません。git stash list で確かめましょう。');
  if (Number.isNaN(n) || !ctx.repo.stash[n]) fail(`error: ${arg} is not a valid reference`, `「${arg}」という stash はありません。git stash list で番号を確かめましょう。`);
  return n;
}

function push(ctx: Ctx, message: string | undefined, untracked: boolean) {
  const repo = ctx.repo;
  if (repo.inProgress) fail(`error: ${repo.inProgress.op} の途中なので stash できません。`, '先に今の操作を完了するか、--abort で中止してください。');
  const head = headOid(repo);
  if (!head) fail('You do not have the initial commit yet', 'まだコミットがないので stash できません。先に1つコミットしましょう。');
  const s = computeStatus(repo);
  const newFiles = untracked ? s.untracked : [];
  if (!s.staged.length && !s.unstaged.length && !newFiles.length) {
    ctx.out('No local changes to save');
    return;
  }
  const branch = currentBranch(repo) ?? '(no branch)';
  const headLine = `${short(head)} ${subject(getCommit(repo, head).message)}`;
  const time = ctx.tick();
  const who = you(ctx, time);
  const sig = { author: who, committer: who };
  // 実 Git と同じく、ステージ（I）・未追跡（U）・ワークツリー（W）の3つのコミットで保存する
  const i = writeCommit(repo, { tree: writeTree(repo, { ...repo.index }), parents: [head], ...sig, message: `index on ${branch}: ${headLine}` });
  const parents = [head, i];
  if (newFiles.length) {
    const files = Object.fromEntries(newFiles.map((p) => [p, writeBlob(repo, repo.workingTree[p])]));
    parents.push(writeCommit(repo, { tree: writeTree(repo, files), parents: [], ...sig, message: `untracked files on ${branch}: ${headLine}` }));
  }
  const wFiles: Record<Path, Oid> = {};
  for (const p of Object.keys(repo.index)) if (p in repo.workingTree) wFiles[p] = writeBlob(repo, repo.workingTree[p]);
  const msg = message ? `On ${branch}: ${message}` : `WIP on ${branch}: ${headLine}`;
  const w = writeCommit(repo, { tree: writeTree(repo, wFiles), parents, ...sig, message: msg, ...(message ? { noNewline: true } : {}) });
  repo.stash.unshift({ oid: w, message: msg });
  logRef(repo, 'refs/stash', null, w, msg, time);

  // HEAD の状態に戻す（git reset --hard と同じ。-u なら未追跡ファイルも消す）
  const headFiles = commitFiles(repo, head);
  for (const p of new Set([...Object.keys(repo.index), ...Object.keys(headFiles)])) {
    if (headFiles[p]) repo.workingTree[p] = getBlob(repo, headFiles[p]);
    else delete repo.workingTree[p];
  }
  repo.index = { ...headFiles };
  for (const p of newFiles) delete repo.workingTree[p];
  ctx.out(`Saved working directory and index state ${msg}`);
  ctx.emit({ type: 'STASHED', oid: w, message: msg });
}

function apply(ctx: Ctx, n: number, drop: boolean) {
  const repo = ctx.repo;
  const entry = repo.stash[n];
  const w = getCommit(repo, entry.oid);
  const head = headOid(repo)!;
  const headFiles = commitFiles(repo, head);
  const baseFiles = commitFiles(repo, w.parents[0]);
  const stashFiles = commitFiles(repo, entry.oid);
  const untracked = w.parents[2] ? commitFiles(repo, w.parents[2]) : {};
  const exists = Object.keys(untracked).filter((p) => p in repo.workingTree);
  if (exists.length) fail(`${exists.map((p) => `${p} already exists, no checkout`).join('\n')}\nerror: could not restore untracked files from stash`, '戻そうとした未追跡ファイルがすでにあります。消すか名前を変えてから戻しましょう。');
  // stash が触るファイルに今の変更があると上書きしてしまうので止める
  const touched = Object.keys({ ...baseFiles, ...stashFiles }).filter((p) => baseFiles[p] !== stashFiles[p]);
  const dirty = touched.filter((p) => repo.index[p] !== headFiles[p] || (p in repo.workingTree ? hashBlob(repo.workingTree[p]) : undefined) !== headFiles[p]);
  if (dirty.length)
    fail(`error: Your local changes to the following files would be overwritten by merge:\n${dirty.map((p) => `\t${p}`).join('\n')}\nPlease commit your changes or stash them before you merge.\nAborting`, '戻す先のファイルに未コミットの変更があります。先にコミットしてから戻しましょう。');

  const m = mergeTrees(repo, baseFiles, headFiles, stashFiles, { ours: 'Updated upstream', theirs: 'Stashed changes' });
  applyTree(repo, headFiles, m.result);
  for (const l of m.lines) if (l.startsWith('CONFLICT') || m.conflicts.length) ctx.out(l, l.startsWith('CONFLICT') ? 'red' : 'normal');
  for (const p of m.conflicts) if (m.conflictText[p] !== undefined) repo.workingTree[p] = m.conflictText[p];
  // 戻した変更は「ステージ前」の扱い（新しく足したファイルだけはステージに載る）
  for (const p of Object.keys({ ...headFiles, ...m.result })) {
    if (headFiles[p]) repo.index[p] = headFiles[p];
    else if (!m.result[p]) delete repo.index[p];
  }
  for (const [p, oid] of Object.entries(untracked)) repo.workingTree[p] = getBlob(repo, oid);
  const conflict = m.conflicts.length > 0;
  status.run({ ...ctx, args: { opts: {}, positional: [], afterDashDash: null } });
  if (conflict) {
    ctx.hint(`${m.conflicts.join(', ')} で今のブランチの変更とぶつかりました。<<<<<<< 〜 >>>>>>> を直してください（このサイトでは、実 Git の「both modified」の代わりに通常の変更として表示します）。`);
    if (drop) ctx.out('The stash entry is kept in case you need it again.');
  } else if (drop) {
    repo.stash.splice(n, 1);
    ctx.out(`Dropped refs/${ref(n)} (${entry.oid})`);
  }
  ctx.emit({ type: 'STASH_APPLIED', oid: entry.oid, dropped: drop && !conflict, conflict });
}

export const stash: CommandDef = {
  name: 'stash',
  spec: { short: { m: 'message', u: 'include-untracked', p: 'patch', k: 'keep-index' }, valued: ['message'], long: ['include-untracked', 'patch', 'keep-index', 'index'] },
  run(ctx) {
    const repo = ctx.repo;
    const { opts, positional } = ctx.args;
    if (opts.patch || opts['keep-index'] || opts.index) unsupported(`stash --${opts.patch ? 'patch' : opts.index ? 'index' : 'keep-index'}`, '退避する範囲を細かく選びます');
    const [sub = 'push', arg] = positional;
    switch (sub) {
      case 'push':
      case 'save':
        return push(ctx, (opts.message as string | undefined) ?? (sub === 'save' ? positional.slice(1).join(' ') || undefined : undefined), Boolean(opts['include-untracked']));
      case 'list':
        repo.stash.forEach((s, i) => ctx.out(`${ref(i)}: ${s.message}`));
        return;
      case 'show': {
        const n = parseIndex(ctx, arg);
        const w = getCommit(repo, repo.stash[n].oid);
        return printSummary(ctx, treeDiffStat(repo, commitFiles(repo, w.parents[0]), commitFiles(repo, repo.stash[n].oid)), true);
      }
      case 'apply':
      case 'pop':
        return apply(ctx, parseIndex(ctx, arg), sub === 'pop');
      case 'drop': {
        const n = parseIndex(ctx, arg);
        const { oid } = repo.stash[n];
        repo.stash.splice(n, 1);
        ctx.out(`Dropped refs/${ref(n)} (${oid})`);
        ctx.emit({ type: 'STASH_DROPPED', oid });
        return;
      }
      case 'clear':
        for (const s of repo.stash) ctx.emit({ type: 'STASH_DROPPED', oid: s.oid });
        repo.stash = [];
        return;
      default:
        unsupported(`git stash ${sub}`, 'push / list / show / apply / pop / drop / clear が使えます');
    }
  },
};
