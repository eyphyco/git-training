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
        // rebase / revert / amend などは専用の説明を出す
        if (events.some((x) => ['REBASED', 'REVERTED', 'CHERRY_PICKED', 'COMMIT_AMENDED', 'SEQUENCE_STOPPED'].includes(x.type))) break;
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
      case 'RESET':
        parts.push(
          `${e.ref} を ${short(e.from)} → ${short(e.to)} に戻しました（${{ soft: '--soft：変更はステージに残っています', mixed: '--mixed：変更はワークツリーに残っています', hard: '--hard：ワークツリーも戻しました' }[e.mode]}）${e.lost.length ? `。${e.lost.length} 個のコミットがどのブランチからも辿れなくなりました（git reflog で戻せます）` : ''}`,
        );
        break;
      case 'COMMIT_AMENDED':
        parts.push(`コミット ${short(e.from)} を作り直して ${short(e.to)} にしました（元のコミットとは別物です）`);
        break;
      case 'REVERTED':
        parts.push(`${short(e.target)} の変更を打ち消すコミット ${short(e.oid)} を新しく作りました（履歴は消えていません）`);
        break;
      case 'CHERRY_PICKED':
        if (!events.some((x) => x.type === 'REBASED')) parts.push(`${short(e.from)} の変更だけをコピーして、新しいコミット ${short(e.oid)} を作りました`);
        break;
      case 'REBASED':
        parts.push(`${e.branch ?? 'HEAD'} のコミットを ${short(e.onto)} の先に付け直しました（コミット ID が変わり、履歴が一直線になります）`);
        break;
      case 'SEQUENCE_STOPPED':
        if (e.reason === 'edit') parts.push('edit の指示で止まりました。直してから git commit --amend → git rebase --continue');
        if (e.reason === 'editor') parts.push('git がエディタの保存を待っています（エディタタブを開きました）');
        break;
      case 'SEQUENCE_ABORTED':
        parts.push(`${e.op} を中止し、始める前の状態に戻しました`);
        break;
      case 'STASHED':
        parts.push('作業中の変更を stash に退避し、ワークツリーを最後のコミットの状態に戻しました');
        break;
      case 'STASH_APPLIED':
        parts.push(e.conflict ? 'stash を戻そうとしましたが、今の変更とぶつかりました' : `stash の変更をワークツリーに戻しました${e.dropped ? '（stash からは削除）' : '（stash には残っています）'}`);
        break;
      case 'STASH_DROPPED':
        parts.push('stash を1つ削除しました');
        break;
      case 'TAG_CREATED':
        parts.push(`${short(e.oid)} に${e.annotated ? '注釈付き' : ''}タグ ${e.name} を付けました（ブランチと違い、コミットしても動きません）`);
        break;
      case 'PR_OPENED':
        parts.push(`PR #${e.number}（${e.head} → ${e.base}）が作られました`);
        break;
      case 'PR_REVIEWED':
        parts.push(`PR #${e.number} に ${e.author} さんのレビュー（${{ approved: '承認', changes_requested: '修正依頼', commented: 'コメント' }[e.state]}）が付きました`);
        break;
      case 'PR_MERGED':
        parts.push(`GitHub 上で PR #${e.number} を ${e.method} でマージしました。GitHub の ${e.base} が進みました（手元は git pull で追いつきます）`);
        break;
      case 'PR_CLOSED':
        parts.push(`PR #${e.number} をマージせずにクローズしました`);
        break;
      case 'ISSUE_CLOSED':
        parts.push(`PR #${e.by} のマージで Issue #${e.number} が自動で閉じました`);
        break;
      case 'PROTECTION_CHANGED':
        parts.push(`${e.branch} のブランチ保護を変更しました`);
        break;
      case 'PUSH_PROTECTED':
        parts.push(`${e.branch} は保護されているため、GitHub が push を拒否しました`);
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
