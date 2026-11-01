# ブランチ保護と Issue 連携

**[[branch-protection|ブランチ保護]]**（Branch protection rule）は、main などの大事なブランチに「ルール」を付ける機能です。

| 設定 | 効果 |
| --- | --- |
| Require a pull request | 直接 push を禁止し、PR 経由だけにする |
| Required approvals | 承認（Approve）が N 件ないとマージできない |
| Require status checks | [[ci|CI]]（自動テスト）が通らないとマージできない |
| Require review from Code Owners | CODEOWNERS に書かれた担当者の承認が必要 |

GitHub タブの **Settings** で設定を見たり変えたりできます。

**Issue 連携**

[[issue|Issue]] は「やること・バグ報告」のチケットです。PR の本文に `Closes #1`（`Fixes #1` なども可）と書くと、PR のマージと同時に Issue #1 が閉じます。
