# rebase：コミットを付け替える

`git rebase main` は、今のブランチのコミットを **main の最新の先に作り直します**。

:::figure{id="rebase"}

- メリット：履歴が一直線で読みやすい
- 注意：コミットが作り直される（ID が変わる）ので、push 済みの共有ブランチには使わない

衝突したら直して `git add` → `git rebase --continue`。やめるなら `git rebase --abort`、そのコミットを飛ばすなら `git rebase --skip`。

**[[interactive-rebase|rebase -i]]（インタラクティブ rebase）**

`git rebase -i HEAD~3` で直近3つのコミットを「どう作り直すか」を指示できます。エディタに次のような todo が開きます。

```
pick 1a2b3c4 # add cart
pick 5d6e7f8 # fix typo in cart
pick 9a0b1c2 # add cart test
```

| 指示 | 意味 |
| --- | --- |
| `pick` | そのまま使う |
| `reword` | 使うが、メッセージを書き直す |
| `edit` | 使った後で止まる（`commit --amend` で直せる） |
| `squash` | 直前のコミットにまとめる（メッセージも合わせて編集） |
| `fixup` | 直前のコミットにまとめる（このメッセージは捨てる） |
| `drop` | 消す（行を消しても同じ） |

行を並べ替えると、コミットの順番も変わります。
