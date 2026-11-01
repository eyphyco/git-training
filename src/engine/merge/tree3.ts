// ファイル単位の 3-way マージ（merge / cherry-pick / revert / rebase / stash apply の共通処理）。
import { getBlob, writeBlob } from '../model/objects';
import type { Oid, Path, RepoState } from '../model/types';
import { mergeText } from './merge3';

export type TreeMerge = {
  result: Record<Path, Oid>;
  /** 衝突したファイルに書き込む、衝突マーカー入りの内容 */
  conflictText: Record<Path, string>;
  conflicts: Path[];
  /** "Auto-merging x" "CONFLICT (content): ..." の出力 */
  lines: string[];
};

/** base → ours と base → theirs の変更を合わせる。labels は衝突マーカーの <<<<<<< / >>>>>>> の後ろに付く名前 */
export function mergeTrees(
  repo: RepoState,
  baseFiles: Record<Path, Oid>,
  oursFiles: Record<Path, Oid>,
  theirsFiles: Record<Path, Oid>,
  labels: { ours: string; theirs: string },
): TreeMerge {
  const result: Record<Path, Oid> = {};
  const conflictText: Record<Path, string> = {};
  const conflicts: Path[] = [];
  const lines: string[] = [];
  for (const p of [...new Set([...Object.keys(baseFiles), ...Object.keys(oursFiles), ...Object.keys(theirsFiles)])].sort()) {
    const [b, o, t] = [baseFiles[p], oursFiles[p], theirsFiles[p]];
    if (o === t || b === t) {
      if (o) result[p] = o;
    } else if (b === o) {
      if (t) result[p] = t;
    } else if (!o || !t) {
      conflicts.push(p);
      lines.push(`CONFLICT (modify/delete): ${p} deleted in ${o ? labels.theirs : labels.ours} and modified in ${o ? labels.ours : labels.theirs}.  Version ${o ? labels.ours : labels.theirs} of ${p} left in tree.`);
      result[p] = (o ?? t)!;
    } else {
      lines.push(`Auto-merging ${p}`);
      const m = mergeText(getBlob(repo, o), b ? getBlob(repo, b) : '', getBlob(repo, t), labels);
      if (m.conflict) {
        conflicts.push(p);
        conflictText[p] = m.text;
        lines.push(`CONFLICT (${b ? 'content' : 'add/add'}): Merge conflict in ${p}`);
        result[p] = o;
      } else result[p] = writeBlob(repo, m.text);
    }
  }
  return { result, conflictText, conflicts, lines };
}
