# Git Training — Claude Code 向けルール

設計書: [docs/design.md](docs/design.md)（§1〜§10）。実装前に該当節を必ず読むこと。

## 定常ルール

- `src/engine/` は UI に依存させない（React・DOM・ブラウザ API を import しない）
- コマンド追加時はテストを先に書く。コマンド1つ＝`src/engine/commands/<name>.ts` ＋ `<name>.test.ts`、登録は `src/engine/registry.ts` に1行
- 1フェーズ＝1ブランチ（`phase-1` など）。小さなコミットに分ける
- main へ直接 push しない。PR を作り、ユーザーがレビューしてからマージする
- 外部通信なし（CDN・API 呼び出し禁止）。`eval` 等は使わない
- 実 Git と挙動が異なる簡略化は、出力メッセージかレッスン解説に明記する

## コマンド

- `npm run dev` — 開発サーバー
- `npm test` — Vitest（エンジン単体＋全レッスン模範解答の自動実行）
- `npm run e2e` — Playwright
- `npm run build` — 型チェック＋本番ビルド
