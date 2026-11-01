# タグと SemVer、GitLab Flow

**[[tag|タグ]]** はコミットに付ける「動かない名札」です。リリースの印に使います。

| コマンド | 意味 |
| --- | --- |
| `git tag v1.0.0` | 軽量タグ（名前だけ） |
| `git tag -a v1.0.0 -m "メモ"` | 注釈付きタグ（作成者・日時・メッセージ付き。リリースにはこちら） |
| `git push origin v1.0.0` / `git push --tags` | タグを GitHub に送る |

**[[semver|SemVer]]（セマンティック バージョニング）**：`MAJOR.MINOR.PATCH`

- PATCH：後方互換のあるバグ修正（1.2.0 → 1.2.1）
- MINOR：後方互換のある機能追加（1.2.1 → 1.3.0）
- MAJOR：互換性のない変更（1.3.0 → 2.0.0）

**GitLab Flow（環境ブランチ）**

main で開発し、`production` などの環境ブランチへ「上流 → 下流」にマージして反映します。修正もまず main に入れてから production へ（upstream first）。本番に出すタイミングを開発と分けられます。
