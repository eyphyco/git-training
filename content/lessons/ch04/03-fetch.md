# fetch とリモート追跡ブランチ

手元の Git は、自分から問い合わせない限り GitHub の変化を知りません。

- `git fetch` … リモートの新しいコミットを取ってきて、**`origin/main` だけ** を更新する（自分の `main` やファイルは変わらない）
- `origin/main` … 「最後に fetch したときのリモートの main の位置」

fetch した後なら、`git status` が **behind（遅れている）** を正しく教えてくれます。取り込む前に `git log origin/main` や `git diff main origin/main` で中身を確認できるのが fetch の良さです。
