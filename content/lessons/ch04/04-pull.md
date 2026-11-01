# pull

`git pull` = `git fetch` ＋ `git merge origin/<追跡先>` です。

- 手元に新しいコミットがなければ **fast-forward**
- 両方に新しいコミットがあれば **マージコミット**（同じ箇所を変えていればコンフリクト）

> 新しい Git では、分岐した状態の pull で「merge にするか rebase にするか」の設定（`pull.rebase`）を求められます。このサイトでは `git config pull.rebase false`（merge）を設定済みとして動きます。rebase は第6章で扱います。

**習慣にしたい流れ**：作業を始める前に `git pull` → 作業・コミット → `git pull` → `git push`
