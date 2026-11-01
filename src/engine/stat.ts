// commit / merge の出力に出す変更集計（"1 file changed, 2 insertions(+)" など）。
import type { Ctx } from './command';
import { countChanges } from './merge/diff';
import { getBlob } from './model/objects';
import type { Oid, Path, RepoState } from './model/types';

export type FileStat = { path: Path; ins: number; del: number; created: boolean; deleted: boolean };

export function treeDiffStat(repo: RepoState, from: Record<Path, Oid>, to: Record<Path, Oid>): FileStat[] {
  const out: FileStat[] = [];
  for (const p of [...new Set([...Object.keys(from), ...Object.keys(to)])].sort()) {
    if (from[p] === to[p]) continue;
    const a = from[p] ? getBlob(repo, from[p]) : '';
    const b = to[p] ? getBlob(repo, to[p]) : '';
    out.push({ path: p, ...countChanges(a, b), created: !from[p], deleted: !to[p] });
  }
  return out;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function printSummary(ctx: Ctx, stats: FileStat[], perFile: boolean) {
  if (!stats.length) return;
  if (perFile) {
    const w = Math.max(...stats.map((s) => s.path.length));
    const nw = Math.max(...stats.map((s) => String(s.ins + s.del).length));
    for (const s of stats) {
      const n = s.ins + s.del;
      ctx.out(` ${s.path.padEnd(w)} | ${String(n).padStart(nw)} ${'+'.repeat(Math.min(s.ins, 40))}${'-'.repeat(Math.min(s.del, 40))}`);
    }
  }
  const ins = stats.reduce((a, s) => a + s.ins, 0);
  const del = stats.reduce((a, s) => a + s.del, 0);
  let line = ` ${plural(stats.length, 'file')} changed`;
  if (ins || !del) line += `, ${ins} insertion${ins === 1 ? '' : 's'}(+)`;
  if (del || !ins) line += `, ${del} deletion${del === 1 ? '' : 's'}(-)`;
  ctx.out(line);
  for (const s of stats) {
    if (s.created) ctx.out(` create mode 100644 ${s.path}`);
    if (s.deleted) ctx.out(` delete mode 100644 ${s.path}`);
  }
}
