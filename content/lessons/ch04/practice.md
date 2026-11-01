# 実機演習：SSH と push

認証の設定は、シミュレータでは練習できません。自分の PC で実際にやってみましょう（このページは手順を表示するだけで、GitHub には接続しません）。

| 方式 | URL の形 | 特徴 |
| --- | --- | --- |
| HTTPS | `https://github.com/<user>/<repo>.git` | 手軽。push 時はトークンでの認証が必要 |
| SSH | `git@github.com:<user>/<repo>.git` | 鍵を一度登録すれば以後パスワード不要 |

**メールアドレスを公開しないために**：GitHub の Settings → Emails にある `<数字>+<ユーザー名>@users.noreply.github.com` を `git config user.email` に設定しておくと、公開リポジトリでも本当のメールアドレスが出ません。

チェックを全部付けると完了になります（章の解放条件ではありません）。
