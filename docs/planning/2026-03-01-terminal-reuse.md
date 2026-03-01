# 空ターミナル再利用計画

## 経緯

VSCode を完全終了→再起動すると:
1. VSCode の built-in 復元がターミナルのタブと位置を復元する
2. しかし CLI プロセスは死んでいるので中身は空のシェル
3. 拡張の auto-restore は新しいターミナルを作成する
4. 結果: 空の抜け殻ターミナル + 新規ターミナルが二重に存在

ユーザーが VSCode のウィンドウ内でターミナルを配置し直している場合（下段→エディタ横など）、
レイアウトが壊れるため UX 上の問題が大きい。

## 初期調査（Issue #14）

ターミナル再利用アプローチ（復元された空ターミナルに `sendText()` で再投入）を検討したが、
批評レビューで複数の致命的問題が指摘された:

- 二重起動防止が未解決（reload 時に claude が 2 プロセス走る）
- Windows で `processId` がハングする既知バグ → 生死判定不可
- 500ms 遅延 + shell integration 待ちの信頼性が低い
- ターミナル命名規則の不整合（`"Claude #N"` vs `"Claude: ..."`)

## 解決策: `isTransient: true`

レビュワーの指摘で `isTransient` オプションの存在が判明。
これにより問題の根本が消え、再利用ロジックは不要になった。

### `isTransient` とは

- VSCode 1.65（2022年2月）で正式化された `TerminalOptions` のオプション
- `true` にすると VSCode の built-in ターミナル復元対象から除外される
- 拡張の最小要件 `"vscode": "^1.96.0"` → 十分満たしている
- 採用例: vscode-js-debug、PowerShell 拡張

### 動作

| | `isTransient: false`（現状） | `isTransient: true`（修正後） |
|---|---|---|
| VSCode 再起動後 | 空ターミナルが復元される | 復元されない |
| auto-restore | 新規ターミナルを作成 → 二重 | 新規ターミナルを作成 → 正常 |
| レイアウト | 空殻が元の位置に残る | 拡張が管理するターミナルのみ |

### 実装

`createTerminal` に `isTransient: true` を追加するだけ。1 行変更。

### 参考

- [VSCode Issue #118726](https://github.com/microsoft/vscode/issues/118726)
- [vscode-js-debug Issue #1196](https://github.com/microsoft/vscode-js-debug/issues/1196)

## 複雑度: 最小

1 行追加。テスト・ロジック変更なし。
