# restore で取り消す

| やりたいこと | コマンド | 動き |
| --- | --- | --- |
| 編集を捨てて元に戻す | `git restore <file>` | ステージ → ワークツリー に上書き |
| ステージから外す | `git restore --staged <file>` | 最新コミット → ステージ に上書き（ワークツリーはそのまま） |

> ⚠️ `git restore <file>` で捨てた変更はコミットされていないため、Git でも復元できません。実務では一番「やってしまう」操作の1つです。

古い Git の解説では `git checkout -- <file>` や `git reset HEAD <file>` と書かれていることがあります。今は `restore` を使うのがおすすめです。
