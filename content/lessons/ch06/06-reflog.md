# reflog：Git の「行き先の記録」

[[reflog|reflog]] は、HEAD やブランチが **どこからどこへ動いたか** の記録です。commit・reset・switch・rebase などのたびに1行ずつ増えます。

```
$ git reflog
3f2a1b0 HEAD@{0}: reset: moving to HEAD~2
9c8d7e6 HEAD@{1}: commit: add profile
...
```

`HEAD@{1}` は「1つ前に HEAD がいた場所」。`git reset --hard HEAD@{1}` で、直前の操作をなかったことにできます。

> reflog は手元のリポジトリだけの記録です（push されません）。また、Git は古い記録やどこからも辿れないコミットを時間がたつと掃除します（既定で 30〜90 日）。
