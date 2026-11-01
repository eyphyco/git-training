# push

`git push` は、手元のコミットを **リモートに送る** 操作です。

| 状況 | コマンド |
| --- | --- |
| 追跡先が設定済み（clone した main など） | `git push` |
| 新しいブランチを初めて送る | `git push -u origin <ブランチ>` |

push に成功すると、リモート（GitHub）のブランチと、手元の `origin/<ブランチ>` の両方が進みます。

`git status` の **ahead / behind** の表示で、push し忘れに気づけます。
