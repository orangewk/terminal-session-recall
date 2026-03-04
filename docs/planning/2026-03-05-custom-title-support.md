# 実装計画: セッション custom-title サポート (#39)

## 要件の再確認

Claude Code の `/rename` コマンドで付けたセッション名を TSR の QuickPick・ターミナルタブ名に反映する。

- **データソース**: セッション JSONL 内の `{"type":"custom-title","customTitle":"..."}` エントリ
- **表示優先度**: `customTitle` > `firstPrompt` > `sessionId.slice(0, 8)`
- **対象箇所**: QuickPick メニュー（全セクション）、ターミナルタブ名、auto-restore 時のタブ名

## 調査結果

### custom-title エントリの構造

```json
{"type":"custom-title","customTitle":"session-quick-pick-ux","sessionId":"3d783908-..."}
```

- セッション JSONL のどこにでも出現しうる（行頭とは限らない）
- 同一セッションに複数回出現可能（`/rename` を複数回実行した場合）→ **最後の出現を採用**
- `readFirstPrompt()` と同じファイルを読むため、1 回の読み込みで両方取得可能

### 現在の表示名の取得フロー

| 箇所 | 現在の実装 | ファイル:行 |
|------|-----------|------------|
| QuickPick Active | `readFirstPrompt()` → `sessionId.slice(0, 8)` | `extension.ts:288-292` |
| QuickPick Resumable (tracked) | `readFirstPrompt()` → `sessionId.slice(0, 8)` | `extension.ts:309-310` |
| QuickPick Resumable (discovered) | `firstPrompt.slice(0, 40)` | `extension.ts:320` |
| QuickPick Completed | `readFirstPrompt()` → `sessionId.slice(0, 8)` | `extension.ts:343-344` |
| resume 時のタブ名 | `displayName` 引数（呼び出し元で決定） | `extension.ts:173` |
| auto-restore 時のタブ名 | `readFirstPrompt()` → `sessionId.slice(0, 8)` | `extension.ts:209-210` |

## 実装フェーズ

### Phase 1: `readSessionDisplayName()` 関数の追加（claude-dir.ts）

既存の `readFirstPrompt()` をリファクタして、1 回の JSONL 読み込みで `customTitle` と `firstPrompt` の両方を取得する新関数を作る。

**新関数**:
```typescript
interface SessionDisplayInfo {
  readonly customTitle: string | undefined;
  readonly firstPrompt: string | undefined;
}

export function readSessionDisplayInfo(
  workspacePath: string,
  sessionId: string,
): SessionDisplayInfo
```

- JSONL を 1 回走査し、`type: "custom-title"` の最後の `customTitle` と、`type: "user"` の最初のテキストを同時に収集
- `readFirstPrompt()` は **そのまま残す**（後方互換性。非推奨にはしない — 呼び出し元が少ないため、次バージョンで自然消滅させる方がシンプル）

**ヘルパー関数**:
```typescript
/** customTitle > firstPrompt > sessionId 短縮の優先度で表示名を返す */
export function resolveDisplayName(
  info: SessionDisplayInfo,
  sessionId: string,
): string
```

### Phase 2: extension.ts の表示名切り替え

すべての `readFirstPrompt()` 呼び出しを `readSessionDisplayInfo()` + `resolveDisplayName()` に置き換え:

1. **QuickPick Active セクション** (L288): description に `customTitle` or `firstPrompt`
2. **QuickPick Resumable tracked** (L309-310): label に `customTitle` or `firstPrompt`
3. **QuickPick Resumable discovered** (L320): label に `customTitle` or `firstPrompt`
4. **QuickPick Completed** (L343-344): label に `customTitle` or `firstPrompt`
5. **resume-tracked / resume-discovered** のアクション (L387-398): `resumeSession` の `displayName` 引数
6. **autoRestoreSessions** (L209-210): タブ名

### Phase 3: `DiscoveredSession` の拡張

`discoverSessions()` が返す `DiscoveredSession` に `customTitle` を追加:

```typescript
export interface DiscoveredSession {
  readonly sessionId: string;
  readonly firstPrompt: string;
  readonly customTitle: string | undefined;  // 追加
  readonly lastSeen: number;
  readonly fileSize: number;
}
```

`discoverSessions()` 内で `readSessionDisplayInfo()` を呼んで `customTitle` を埋める。

### Phase 4: テスト

`claude-dir.test.ts` に以下を追加:

1. `readSessionDisplayInfo` — custom-title エントリが 1 つの場合
2. `readSessionDisplayInfo` — custom-title エントリが複数の場合（最後を採用）
3. `readSessionDisplayInfo` — custom-title なし（firstPrompt のみ）
4. `readSessionDisplayInfo` — 両方なし
5. `resolveDisplayName` — 優先度テスト（customTitle > firstPrompt > fallback）

## 影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `src/claude-dir.ts` | `readSessionDisplayInfo()`, `resolveDisplayName()` 追加。`DiscoveredSession` 拡張 |
| `src/extension.ts` | 表示名取得を新 API に切り替え |
| `src/claude-dir.test.ts` | 新関数のテスト追加 |

## リスク

| リスク | 影響 | 対策 |
|-------|------|------|
| JSONL ファイルが大きい場合の読み込みコスト | 既に `readFirstPrompt()` で全行読みしているため追加コストなし | 将来最適化（先頭 N バイト読み）は別 Issue |
| `custom-title` の仕様が変わる | 表示名が取れなくなる（firstPrompt にフォールバック） | フォールバックチェーンで耐性あり |

## 複雑度: 低

- 変更ファイル 3 つ
- 新しい外部依存なし
- 既存の読み込みロジックの拡張のみ
- フォールバックがあるため破壊リスクが低い

## 経緯

1. Issue #39 を当初「ユーザーが手動で名前をつける」機能として起票 → ユーザーが修正
2. ユーザーから「Claude Code の `/rename` で付けた名前をそのまま使いたい」と要件明確化
3. ユーザーがセッション JSONL 内の `type: "custom-title"` エントリの存在を教示
4. 実データ確認: 同一セッションに `custom-title` が複数行ある場合がある → 最後を採用する設計に
