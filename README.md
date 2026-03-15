# Terminal Session Recall

> Unofficial VSCode extension — Automatically restore Claude Code CLI sessions after restart

![UI Overview](art/ui-overview.png)

## Features

- Status bar shows live and idle session counts for the current project
- QuickPick session manager: start new sessions, resume interrupted or completed sessions
- Automatically restores interrupted sessions when VSCode restarts
- **Session presets** — save pre-configured session templates for one-click launch
- **Preset manager** — dedicated Webview panel for creating, editing, and removing presets
- **Auto-launch** — presets with `autoLaunch` enabled start automatically on VS Code startup
- **Adopt running sessions** — attach the extension to an already-running Claude terminal
- **Process inspection (Linux)** — auto-detects session ID, working directory, user, and CLI args from running Claude processes via procfs
- **Terminal rename sync** — renaming a terminal tab automatically updates the tracked session and preset (2-second polling)
- **Status bar tooltip** — hover over the status bar to see a list of tracked terminals with session IDs
- **Configurable CLI arguments** — global `claudeArgs` with per-preset overrides
- **User switching** — run Claude as a different system user via `userName` and a configurable `shellWrapper`

## Requirements

- Claude Code CLI must be installed and available on your PATH

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| claudeResurrect.autoRestore | true | Automatically restore interrupted sessions on startup |
| claudeResurrect.autoRestoreMaxAge | 24 | Maximum age (hours) of sessions to auto-restore |
| claudeResurrect.claudePath | "claude" | Path to the Claude CLI executable |
| claudeResurrect.claudeArgs | [] | Extra CLI arguments passed to every Claude session (e.g. `--model`, `--verbose`) |
| claudeResurrect.userName | "" | System user name for running Claude sessions. Used as terminal name prefix and in `shellWrapper` `{user}` placeholder |
| claudeResurrect.shellWrapper | `su - {user} -c 'cd {cwd} && {cmd}'` | Shell command template when `userName` is set. Placeholders: `{cmd}`, `{cwd}`, `{user}` |
| claudeResurrect.maxQuickPickSessions | 10 | Maximum number of resumable/completed sessions shown in the QuickPick menu |
| claudeResurrect.sessionPresets | [] | Pre-configured session templates (managed via the Preset Manager UI) |

## Limitations

- **Only sessions started through this extension are fully tracked.** The status bar "live" count and auto-restore only cover sessions launched via the QuickPick menu or auto-restore. Sessions started manually in a terminal (e.g., `claude` or `claude --resume`) are not tracked as "live" — they may appear as idle in the session list even while running.
- **This extension does not manage session data.** It only reads what Claude CLI creates. Sessions with no conversation (e.g., opened and immediately closed) are excluded from the session list, but cannot be deleted by this extension.
- **Read-only by design.** Deleting or modifying `~/.claude/` data is out of scope. Use Claude CLI directly to manage session history.

## Data Access

This extension reads the following from `~/.claude/`:

- **`history.jsonl`** — session history (session ID, project path, first prompt, timestamp)
- **Directory listing** of `projects/<slug>/` (file names only, to locate session files)
- **File size** of session JSONL files via `stat()`
- **First 8KB** of session JSONL files — to extract display titles, first prompt, permission mode, and model for adopt/display

This extension does NOT:

- Write to `~/.claude/` (read-only access)
- Read authentication tokens or API keys
- Parse full conversation history (only reads first 8KB for metadata)
- Send any data over the network
- Collect telemetry

### How we enforce this

- All `~/.claude/` access is isolated in read-only modules (`claude-dir.ts`, `process-inspector.ts`)
- CI checks block PRs that introduce write APIs or network calls outside allowed modules
- The extension is open source — you can audit the code

---

## 日本語

> 非公式 VSCode 拡張 — Claude Code CLI のセッションを VSCode 再起動後に自動復元

![UI 概要](art/ui-overview-ja.png)

### 機能

- ステータスバーにプロジェクトごとのセッション数を表示（live / idle）
- Quick Pick メニューでセッション管理：新規作成、中断・完了セッションの再開
- VSCode 再起動時に中断セッションを自動復元
- **セッションプリセット** — ワンクリック起動用のテンプレートを保存
- **プリセットマネージャー** — Webview パネルでプリセットの作成・編集・削除
- **自動起動** — `autoLaunch` 有効なプリセットは VS Code 起動時に自動実行
- **実行中セッションの取り込み** — 既存の Claude ターミナルを拡張に紐付け
- **プロセス検査（Linux）** — procfs を使用して実行中の Claude プロセスからセッション ID・CWD・ユーザー・CLI 引数を自動検出
- **ターミナルリネーム同期** — ターミナルタブのリネームがプリセットに自動反映（2秒ポーリング）
- **ステータスバーツールチップ** — ホバーで追跡中ターミナル一覧とセッション ID を表示
- **CLI 引数設定** — グローバル `claudeArgs` とプリセットごとのオーバーライド
- **ユーザー切り替え** — `userName` と `shellWrapper` で別ユーザーとして実行

### 前提条件

- Claude Code CLI がインストール済みで PATH に通っていること

### 制限事項

- **追跡できるのは、この拡張経由で起動したセッションのみ。** ステータスバーの "live" カウントや自動復元は、QuickPick メニューまたは自動復元で起動したセッションだけが対象。ターミナルで手動起動した `claude` セッションは "live" として追跡されないため、実行中でも idle として一覧に表示されることがある。
- **セッションデータの管理は行わない。** CLI が作成したデータを読み取るだけ。会話が発生していないセッションは一覧に表示されない。
- **読み取り専用。** `~/.claude/` への書き込み・削除は行わない。セッション履歴の管理は Claude CLI 側で行う。

## License

MIT
