# push rejected

```
 ! [rejected]        main -> main (fetch first)
error: failed to push some refs to 'https://github.com/team/app.git'
```

これは「リモートに、あなたの手元にないコミットがある」という意味です。そのまま push するとそのコミットを消してしまうので、Git が拒否しています。

**対処は決まっています**

1. `git pull`（取り込む。コンフリクトしたら第3章の手順で解消）
2. `git push`

> ⚠️ `git push --force` で押し通すと、他の人のコミットが消えます。チームの共有ブランチでは使わないこと。
