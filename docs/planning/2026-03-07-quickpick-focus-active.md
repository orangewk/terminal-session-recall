# QuickPick から稼働中ターミナルにフォーカス (#45)

## 要件

- QuickPick の Active セクションでセッションを選ぶと、既存ターミナルにフォーカスが移る
- 現状は `resume-tracked` アクションが走り、同じセッションの重複ターミナルが開く
- Active セッションが「選択可能（フォーカスできる）」と視覚的にわかる UI ヒントを入れる

## 実装フェーズ

### Phase 1: アクション追加 + ルーティング

**対象**: `src/extension.ts`

1. `MenuItem.action` の型に `"focus"` を追加
2. Active セクションのアイテム生成で `action: "focus"` を設定
3. `switch` 文に `case "focus"` を追加
   - `vscode.window.terminals` を `terminalName` で検索
   - 見つかったら `terminal.show()`
   - 見つからなければ warning 表示

### Phase 2: UI ヒント

- Active アイテムの label アイコン: `$(circle-filled)` → `$(terminal)`
- description 末尾に `$(arrow-right)` を追加

## 影響範囲

- `src/extension.ts` のみ（QuickPick 構築部分 + switch 文）

## リスク

- **LOW**: `vscode.window.terminals` は現在のウィンドウのみ。マルチウィンドウは #46 の範囲

## 複雑度: 低
