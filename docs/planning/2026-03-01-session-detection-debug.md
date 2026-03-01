# セッション検知デバッグ — 構造図

## 2つのレイヤー

### 本番 UX（実際のユーザー体験）

```mermaid
graph LR
    subgraph "ユーザーの VSCode"
        WS["workspace: c:\dev\quantum-scribe"]
        EXT["claude-resurrect 拡張"]
        SB["ステータスバー<br/>Claude: 3 sessions"]
        T1["Terminal: Claude #1"]
        T2["Terminal: Claude #2"]
        T3["Terminal: Claude #3"]
    end

    subgraph "~/.claude/projects/c--dev-quantum-scribe/"
        S1["session-aaa.jsonl"]
        S2["session-bbb.jsonl"]
        S3["session-ccc.jsonl"]
    end

    WS --> EXT
    EXT --> SB
    EXT -->|fs.watch| S1
    T1 -->|claude CLI が書き込む| S1
    T2 -->|claude CLI が書き込む| S2
    T3 -->|claude CLI が書き込む| S3
```

ポイント: **ワークスペース = 実プロジェクト**。拡張とCLIが同じプロジェクトスラグを参照する。

---

### F5 開発テスト（現在の状態）

```mermaid
graph TD
    subgraph "VSCode 1: 開発側"
        DEV["c:\dev\claude-resurrect<br/>（ソースコード編集）"]
        F5["F5 → Extension Host 起動"]
    end

    subgraph "VSCode 2: Extension Development Host"
        EDH["workspace: c:\dev\claude-resurrect<br/>（拡張自身のリポ）"]
        EXT["claude-resurrect 拡張が動く"]
        SB["ステータスバー<br/>Claude: 0 sessions"]
        WATCH["fs.watch 監視先:<br/>~/.claude/projects/c--dev-claude-resurrect/"]
        TERM["New Session ターミナル"]
        CLI["Claude CLI"]
    end

    subgraph "~/.claude/projects/"
        CR["c--dev-claude-resurrect/<br/>❌ 存在しない"]
        QS["c--dev-quantum-scribe/<br/>✅ 59 セッション"]
    end

    DEV --> F5 --> EDH
    EDH --> EXT --> SB
    EXT --> WATCH
    EXT -->|createTerminal| TERM --> CLI

    WATCH -.->|監視| CR
    CLI -.->|書き込み先?| CR
```

**問題**: Extension Dev Host のワークスペースが `claude-resurrect`（拡張のソースコード自体）なので、
テスト時に Claude セッションが作られても、本番 UX の動作を再現していない。

---

## 気づき

| 観点 | 本番 UX | F5 テスト（現状） |
|------|---------|-------------------|
| ワークスペース | 実プロジェクト（quantum-scribe 等） | 拡張自身のリポ（claude-resurrect） |
| 既存セッション | あり（59件等） | なし（0件） |
| 拡張の監視先 | 既存セッションがあるディレクトリ | 空のディレクトリ |
| テストの意味 | 実シナリオ | 自己参照的で不自然 |

## 結論

F5 テストで本番の動作を確認するには、Extension Dev Host が開くフォルダを
**既にセッションがある実プロジェクト**にすべき。
