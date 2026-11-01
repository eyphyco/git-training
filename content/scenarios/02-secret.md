# 秘密情報をコミットしてしまった

push 前ならまだ間に合います。

- `git rm --cached <file>`：ファイルは残したまま、Git の管理（ステージ）からだけ外す
- `.gitignore`：今後うっかり add しないようにする
- `git commit --amend`：直前のコミットを作り直す（push 前なので安全）
