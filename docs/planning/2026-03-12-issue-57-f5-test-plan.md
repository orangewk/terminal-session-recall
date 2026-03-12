# Issue #57: F5 デバッグ検証手順

## 前提

- F5 で Extension Development Host（以下 EDH）を起動済み

## テスト 1: Full Close → Restart での autoRestore

1. F5 で EDH を起動する
2. コマンドパレット → `Terminal Session Recall: New Session` を実行する
3. Claude CLI が起動したら、何か一言会話する（例: `hello`）。セッションファイルにデータが書き込まれる必要があるため
4. ステータスバーが `TS Recall: 1 live` に変わることを確認する
5. **EDH の VSCode インスタンスを終了する**（Alt+F4 または ファイル → ウィンドウを閉じる）
6. F5 で EDH を再度起動する
7. 「Restored 1 interrupted session(s).」の通知が表示されることを確認する
8. ステータスバーが `TS Recall: 1 live` であることを確認する
9. 復元されたターミナルのゴミ箱アイコンをクリックして閉じる
10. ステータスバーが `TS Recall: 0 live` であることを確認する

## テスト 2: Reload Window で二重生成しないこと

1. F5 で EDH を起動する
2. コマンドパレット → `Terminal Session Recall: New Session` を実行する
3. Claude CLI が起動したら、何か一言会話する（例: `hello`）
4. ステータスバーが `TS Recall: 1 live` に変わることを確認する
5. コマンドパレット → `Developer: Reload Window` を実行する
6. EDH がリロードされるのを待つ
7. ターミナルパネルに同じセッションのターミナルが 1 つだけ存在することを確認する（二重生成なし）
8. ステータスバーが `TS Recall: 1 live` であることを確認する
9. ターミナルのゴミ箱アイコンをクリックして閉じる
10. ステータスバーが `TS Recall: 0 live` であることを確認する
