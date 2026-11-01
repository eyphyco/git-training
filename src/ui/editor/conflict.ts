// 衝突マーカーの解消（エディタの「現在の変更を採用 / 取り込む変更を採用 / 両方を採用」ボタン）。
export type Resolution = 'ours' | 'theirs' | 'both';

export function hasConflict(text: string): boolean {
  return /^<<<<<<< /m.test(text) && /^>>>>>>> /m.test(text);
}

/** すべての衝突ブロックを、指定した側の内容で置き換える */
export function resolveConflicts(text: string, how: Resolution): string {
  return text.replace(/^<<<<<<< [^\n]*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> [^\n]*\n?/gm, (_, ours: string, theirs: string) =>
    how === 'ours' ? ours : how === 'theirs' ? theirs : ours + theirs,
  );
}
