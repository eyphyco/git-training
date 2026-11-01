import { fail, type CommandDef, type Ctx } from '../command';
import { hunks } from '../merge/diff';
import { matchPathspec } from '../parser';
import { commitFiles, getBlob, hashBlob, short } from '../model/objects';
import { headOid, resolveRev } from '../model/refs';
import type { Oid, Path } from '../model/types';
import { printSummary, type FileStat } from '../stat';
import { countChanges } from '../merge/diff';

type Side = Record<Path, { oid: Oid; content: string }>;

const ZERO = '0000000';

function printFileDiff(ctx: Ctx, path: Path, a?: { oid: Oid; content: string }, b?: { oid: Oid; content: string }) {
  ctx.out(`diff --git a/${path} b/${path}`, 'normal');
  if (!a) ctx.out('new file mode 100644');
  if (!b) ctx.out('deleted file mode 100644');
  ctx.out(`index ${a ? short(a.oid) : ZERO}..${b ? short(b.oid) : ZERO}${a && b ? ' 100644' : ''}`);
  const ha = hunks(a?.content ?? '', b?.content ?? '');
  if (!ha.length) return;
  ctx.out(a ? `--- a/${path}` : '--- /dev/null');
  ctx.out(b ? `+++ b/${path}` : '+++ /dev/null');
  for (const l of ha) ctx.out(l.text, l.tone);
}

export const diff: CommandDef = {
  name: 'diff',
  spec: { long: ['staged', 'cached', 'stat', 'name-only'] },
  run(ctx) {
    const repo = ctx.repo;
    const { opts } = ctx.args;
    const fromCommit = (oid: Oid | null): Side =>
      Object.fromEntries(Object.entries(commitFiles(repo, oid)).map(([p, o]) => [p, { oid: o, content: getBlob(repo, o) }]));
    const index: Side = Object.fromEntries(Object.entries(repo.index).map(([p, o]) => [p, { oid: o, content: getBlob(repo, o) }]));
    const worktree = (): Side =>
      Object.fromEntries(Object.entries(repo.workingTree).filter(([p]) => p in repo.index).map(([p, c]) => [p, { oid: hashBlob(c), content: c }]));

    const revs: Oid[] = [];
    const paths: string[] = [...(ctx.args.afterDashDash ?? [])];
    for (const p of ctx.args.positional) {
      const oid = ctx.args.afterDashDash ? null : resolveRev(repo, p);
      if (oid) revs.push(oid);
      else if (p in repo.workingTree || Object.keys(repo.index).some((q) => matchPathspec(p, q))) paths.push(p);
      else fail(`fatal: ambiguous argument '${p}': unknown revision or path not in the working tree.`, `「${p}」というコミットやファイルは見つかりません。`);
    }
    let a: Side;
    let b: Side;
    const staged = opts.staged || opts.cached;
    if (revs.length >= 2) [a, b] = [fromCommit(revs[0]), fromCommit(revs[1])];
    else if (revs.length === 1) [a, b] = [fromCommit(revs[0]), staged ? index : worktree()];
    else if (staged) [a, b] = [fromCommit(headOid(repo)), index];
    else [a, b] = [index, worktree()];

    const changed = [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter((p) => a[p]?.oid !== b[p]?.oid)
      .filter((p) => !paths.length || paths.some((s) => matchPathspec(s, p)))
      .sort();
    if (opts['name-only']) return changed.forEach((p) => ctx.out(p));
    if (opts.stat) {
      const stats: FileStat[] = changed.map((p) => ({ path: p, ...countChanges(a[p]?.content ?? '', b[p]?.content ?? ''), created: false, deleted: false }));
      return printSummary(ctx, stats, true);
    }
    for (const p of changed) printFileDiff(ctx, p, a[p], b[p]);
    if (!changed.length && !staged && !revs.length && Object.keys(repo.index).length)
      ctx.hint(
        Object.keys(repo.workingTree).some((p) => !(p in repo.index))
          ? '（差分なし）git diff はステージとワークツリーの差だけを表示します。未追跡ファイルは対象外です。'
          : '（差分なし）ステージ済みの変更を見るには git diff --staged を使います。',
      );
  },
};
