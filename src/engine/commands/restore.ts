import { fail, type CommandDef, type Ctx } from '../command';
import { matchPathspec } from '../parser';
import { commitFiles, getBlob } from '../model/objects';
import { headOid, resolveRev } from '../model/refs';
import type { Oid, Path } from '../model/types';

export function restorePaths(ctx: Ctx, specs: string[], o: { staged: boolean; worktree: boolean; source?: string }) {
  const repo = ctx.repo;
  let source: Record<Path, Oid> | null = null;
  if (o.source) {
    const oid = resolveRev(repo, o.source);
    if (!oid) fail(`fatal: could not resolve ${o.source}`, `「${o.source}」というコミットは見つかりません。`);
    source = commitFiles(repo, oid);
  } else if (o.staged) {
    const h = headOid(repo);
    if (!h) fail('fatal: could not resolve HEAD', 'まだコミットがないので HEAD から戻せません。ステージから外すには git rm --cached <file> を使います。');
    source = commitFiles(repo, h);
  }
  // --staged なしならインデックスの内容をワークツリーへ戻す
  const from: Record<Path, Oid> = source ?? { ...repo.index };
  const universe = [...new Set([...Object.keys(from), ...Object.keys(repo.index), ...(o.worktree && source ? Object.keys(repo.workingTree) : [])])];
  for (const spec of specs) {
    const hits = universe.filter((p) => matchPathspec(spec, p));
    if (!hits.length) fail(`error: pathspec '${spec}' did not match any file(s) known to git`, `「${spec}」は Git が知らないファイルです（未追跡のファイルは restore できません）。`);
    for (const p of hits) {
      if (repo.inProgress?.conflicts.includes(p) && o.worktree && !o.source)
        fail(`error: path '${p}' is unmerged`, 'コンフリクト中のファイルです。手で直して git add するか、git merge --abort で中止します。');
      if (o.staged && repo.index[p] !== from[p]) {
        if (from[p]) repo.index[p] = from[p];
        else delete repo.index[p];
        ctx.emit({ type: 'FILE_UNSTAGED', path: p });
      }
      if (o.worktree) {
        const want = from[p] ? getBlob(repo, from[p]) : undefined;
        if (repo.workingTree[p] === want) continue;
        // ソースにないファイルは、--source 指定でかつ追跡中のときだけ消す
        if (want === undefined) {
          if (!(p in repo.index) || source) delete repo.workingTree[p];
          else continue;
        } else repo.workingTree[p] = want;
        ctx.emit({ type: 'FILE_RESTORED', path: p });
      }
    }
  }
}

export const restore: CommandDef = {
  name: 'restore',
  spec: { short: { S: 'staged', W: 'worktree', s: 'source' }, valued: ['source'] },
  run(ctx) {
    const { opts } = ctx.args;
    const specs = [...ctx.args.positional, ...(ctx.args.afterDashDash ?? [])];
    if (!specs.length) fail('fatal: you must specify path(s) to restore', '戻したいファイル名を指定してください（例: git restore README.md）');
    const staged = Boolean(opts.staged);
    const worktree = Boolean(opts.worktree) || !staged;
    restorePaths(ctx, specs, { staged, worktree, source: opts.source as string | undefined });
  },
};
