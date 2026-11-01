# fast-forward マージ

`git merge <ブランチ>` は、指定したブランチの変更を **今いるブランチ** に取り込みます。

main から feature/login を作って以降、main に新しいコミットがなければ、main の名札を feature/login の位置まで「早送り」するだけで済みます。これが **[[fast-forward]]** マージです。新しいコミットは作られません。

```
before:  c1 (main) ── c2 (feature/login)
after:   c1 ── c2 (main, feature/login)
```
