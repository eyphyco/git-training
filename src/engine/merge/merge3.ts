// 行単位の 3-way マージ（node-diff3）。衝突時は実 Git と同じマーカーを書き込む。
import { diff3Merge } from 'node-diff3';
import { splitLines } from './diff';

export function mergeText(
  ours: string,
  base: string,
  theirs: string,
  labels: { ours: string; theirs: string },
): { text: string; conflict: boolean } {
  const regions = diff3Merge(splitLines(ours), splitLines(base), splitLines(theirs), { excludeFalseConflicts: true });
  let text = '';
  let conflict = false;
  const ensureEol = (s: string) => (s === '' || s.endsWith('\n') ? s : `${s}\n`);
  for (const r of regions) {
    if (r.ok) text += r.ok.join('');
    else if (r.conflict) {
      conflict = true;
      text += `<<<<<<< ${labels.ours}\n${ensureEol(r.conflict.a.join(''))}=======\n${ensureEol(r.conflict.b.join(''))}>>>>>>> ${labels.theirs}\n`;
    }
  }
  return { text, conflict };
}
