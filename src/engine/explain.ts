// events から「今何が起きたか」の1行説明を作る（可視化層が表示する）。
import { short } from './model/objects';
import type { GitEvent } from './model/types';

export function explainEvents(events: GitEvent[]): string | null {
  const parts: string[] = [];
  const staged = events.filter((e) => e.type === 'FILE_STAGED');
  const unstaged = events.filter((e) => e.type === 'FILE_UNSTAGED');
  const restored = events.filter((e) => e.type === 'FILE_RESTORED');
  const written = events.filter((e) => e.type === 'FILE_WRITTEN');
  const deleted = events.filter((e) => e.type === 'FILE_DELETED');
  const names = (es: { path: string }[]) => (es.length > 3 ? `${es.slice(0, 3).map((e) => e.path).join('、')} ほか${es.length - 3}件` : es.map((e) => e.path).join('、'));

  for (const e of events) {
    switch (e.type) {
      case 'REPO_INITIALIZED':
        parts.push('.git フォルダが作られ、ここが Git リポジトリになりました');
        break;
      case 'COMMIT_CREATED':
        parts.push(
          e.parents.length > 1
            ? `親を2つ持つマージコミット ${short(e.oid)} を作りました`
            : `ステージの内容をスナップショットとして保存し、コミット ${short(e.oid)} を作りました${e.branch ? `（${e.branch} が1つ進みました）` : '（detached HEAD のまま進みました）'}`,
        );
        break;
      case 'MERGE_FAST_FORWARD':
        parts.push(`${e.branch} を ${short(e.from)} → ${short(e.to)} へ前に進めただけです（fast-forward。新しいコミットは作っていません）`);
        break;
      case 'CONFLICT':
        parts.push(`${e.paths.join('、')} で両方のブランチが同じ箇所を変えていたため、コンフリクトになりました`);
        break;
      case 'MERGE_ABORTED':
        parts.push('マージを中止し、マージ前の状態に戻しました');
        break;
      case 'BRANCH_CREATED':
        parts.push(`ブランチ ${e.name} を ${short(e.oid)} の位置に作りました（HEAD は動いていません）`);
        break;
      case 'BRANCH_DELETED':
        parts.push(`ブランチ ${e.name} を削除しました（コミット自体は消えていません）`);
        break;
      case 'BRANCH_RENAMED':
        parts.push(`ブランチ名を ${e.from} から ${e.to} に変えました`);
        break;
      case 'HEAD_MOVED':
        if (!events.some((x) => x.type === 'BRANCH_CREATED'))
          parts.push(e.detached ? `HEAD がコミット ${e.to} を直接指す detached HEAD になりました` : `HEAD が ${e.to} に移動し、ワークツリーが ${e.to} の内容に入れ替わりました`);
        else parts.push(`HEAD が新しいブランチ ${e.to} に移動しました`);
        break;
      case 'CONFIG_SET':
        parts.push(`${e.key} を「${e.value}」に設定しました`);
        break;
    }
  }
  if (staged.length && !events.some((e) => e.type === 'COMMIT_CREATED' || e.type === 'HEAD_MOVED' || e.type === 'MERGE_FAST_FORWARD'))
    parts.unshift(`${names(staged)} をステージに載せました（ワークツリー → ステージ）`);
  if (unstaged.length) parts.push(`${names(unstaged)} をステージから外しました（ワークツリーの内容はそのまま）`);
  if (restored.length) parts.push(`${names(restored)} のワークツリーの変更を取り消しました`);
  if (written.length) parts.push(`${names(written)} を${written.every((e) => e.created) ? '作成' : '書き換え'}しました（まだワークツリーだけの変更です）`);
  if (deleted.length && !staged.length) parts.push(`${names(deleted)} をワークツリーから削除しました`);
  return parts.length ? parts.join('。') + '。' : null;
}
