# レビューする側・CODEOWNERS・GitLab との違い

**レビューする側の手順**

1. `gh pr checkout <番号>` で PR のブランチを手元に取り込む（動かして確かめる）
2. Files changed で差分を読む。気になる行にはコメント
3. Approve / Request changes / Comment のどれかで返す

**[[codeowners|CODEOWNERS]]**

`.github/CODEOWNERS` に「パターン 担当者」を書くと、そのファイルを変える PR に担当者のレビューが求められます。

```
*.css      @you
/docs/     @tech-writer
```

**GitLab との用語の違い**

このサイトの模擬画面は GitHub 風です。GitLab を使う職場では、次のように読み替えてください。

| GitHub | GitLab |
| --- | --- |
| Pull Request（PR） | [[merge-request|Merge Request（MR）]] |
| Approve | Approve（承認） |
| Branch protection rule | Protected branches |
| GitHub Actions | GitLab CI/CD |
| CODEOWNERS | CODEOWNERS（Code Owners） |
