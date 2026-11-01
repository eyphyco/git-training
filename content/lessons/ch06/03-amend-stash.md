# amend と stash

**[[amend|git commit --amend]]**：直前のコミットを作り直す

- メッセージの打ち間違い：`git commit --amend -m "正しいメッセージ"`
- ファイルの入れ忘れ：`git add 忘れたファイル` → `git commit --amend --no-edit`

作り直したコミットは **別の ID** になります。push 済みのコミットには使わないこと。

**[[stash|git stash]]**：作業途中の変更を一時退避する

| コマンド | 意味 |
| --- | --- |
| `git stash` | 変更を退避して、ワークツリーをきれいにする（`-m "メモ"` も付けられる） |
| `git stash list` | 退避した一覧 |
| `git stash pop` | 最新の退避を戻して、一覧から消す |
| `git stash apply` | 戻すが、一覧には残す |
| `git stash -u` | 未追跡のファイルも退避する |

> 実 Git の `git stash pop` で衝突したときは、ファイルが「both modified」になります。このサイトでは通常の変更として表示します。
