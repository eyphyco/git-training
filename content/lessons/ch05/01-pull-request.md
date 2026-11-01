# PR（Pull Request）を作る

チーム開発では、main に直接コミットせず、次の流れで変更を入れます。

1. 作業用の[[branch|ブランチ]]を作る（`git switch -c feature/xxx`）
2. コミットして GitHub に [[push]] する
3. GitHub で **[[pull-request|PR]]** を作る（「このブランチを main に取り込んでください」という依頼）
4. チームが差分を[[code-review|レビュー]]し、OK ならマージする

**gh コマンド**

`gh` は GitHub 公式のコマンドラインツール（GitHub CLI）です。ブラウザを開かずに PR を作ったり確認したりできます。

| やりたいこと | コマンド |
| --- | --- |
| PR を作る | `gh pr create --title "..." --body "..."` |
| PR の一覧 | `gh pr list` |
| PR の詳細 | `gh pr view 1` |

> このサイトの gh は模擬です（本物の GitHub には接続しません）。画面の「GitHub」タブでも同じ操作ができます。
