# hooks・worktree と AI 時代の Git

**hooks**：Git の操作の前後に自動で動くスクリプト（`.git/hooks/<名前>`）

| hook | いつ | 0 以外で終わると |
| --- | --- | --- |
| pre-commit | commit の前 | コミットしない |
| commit-msg | メッセージを書いた後（`$1` がメッセージのファイル） | コミットしない |
| pre-push | push の前（`$1` がリモート名） | push しない |

`--no-verify` で飛ばせますが、ルールを破ることになります。

> このサイトの hooks は小さなシェル（echo / exit / if / grep / cat / test / パイプ / `git diff --cached` など）で動きます。実機では `chmod +x .git/hooks/pre-commit` で実行権限が必要で、husky や pre-commit などのツールでチームに配ることが多いです。

**worktree**：1つのリポジトリで、作業フォルダを複数持つ

| コマンド | 意味 |
| --- | --- |
| `git worktree add ../hotfix` | ../hotfix に hotfix ブランチを作って展開 |
| `git worktree add ../feat feature` | 既存のブランチを展開 |
| `git worktree list` / `remove` | 一覧 / 削除 |

**AI エージェントと Git**

Claude Code のような AI エージェントには、コミットや PR の作成も任せられます。安全に回すコツは次のとおりです。

- エージェントごとに worktree とブランチを分ける（並列で作業しても混ざらない）
- 変更は必ず PR にして、人がレビューしてからマージする
- main はブランチ保護で守る（直接 push させない）
- 小さな単位でコミットさせる（rebase -i や revert で直しやすい）

このサイト自体も、Claude Code がフェーズごとにブランチで作り、PR を出してマージしています。
