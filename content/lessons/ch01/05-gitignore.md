# .gitignore

[[gitignore|.gitignore]] に書いたパターンに当てはまる **未追跡** ファイルは、`git status` に出なくなり、`git add .` でも載らなくなります。

```
*.log          # 拡張子 .log のファイル全部
node_modules/  # node_modules フォルダの中全部（末尾 / はフォルダだけ）
.env           # 秘密情報
/build         # 先頭 / はルート直下の build だけ
!keep.log      # ! で例外（無視しない）
```

> このサイトではルート直下の .gitignore だけに対応しています（実 Git はサブフォルダの .gitignore も読みます）。
