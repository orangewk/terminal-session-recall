# Changelog

## 1.1.0

### Features
- Session presets: save pre-configured session templates for one-click launch from the QuickPick menu
- Webview preset manager: dedicated UI panel for creating, editing, and removing presets (`Manage Presets` command)
- Auto-launch presets on VS Code startup via the `autoLaunch` flag
- Adopt running sessions: attach the extension to an already-running Claude terminal and auto-create a preset
- Process inspection (Linux): auto-detect session ID, working directory, user, and CLI args from running Claude processes via procfs
- Terminal rename sync: renaming a terminal tab automatically updates the tracked session and preset (2-second polling)
- Status bar tooltip: hover to see tracked terminals with session IDs and inactive session count
- Adopt available from QuickPick menu (not just Command Palette)
- Configurable CLI arguments (`claudeArgs`) passed to every Claude session — editable from Settings or the preset manager
- Per-preset CLI argument overrides
- `userName` setting to run Claude as a different system user (e.g. for `--dangerously-skip-permissions` on non-root)
- Per-preset `userName` override
- Configurable `shellWrapper` template with `{cmd}`, `{cwd}`, `{user}` placeholders — supports `su`, `sudo`, or any custom wrapper
- Per-preset `shellWrapper` override
- `maxQuickPickSessions` setting to limit resumable sessions in QuickPick (default: 10)

### Bug fixes
- Fix: status bar "0 live" when preset-launched terminals are running (projectPath prefix matching)
- Fix: stale active sessions never pruned after Reload Window (auto-cleanup on startup)
- Fix: QuickPick slow to open — lazy session display info loading, capped session count
- Fix: adopt preset missing CLI args — extract `--model` and `--dangerously-skip-permissions` from session JSONL
- Fix: rename polling not finding preset — fallback to terminalName/label match when sessionId is missing
- Fix: inactive session count in tooltip showing all projects — now filtered to current workspace

## 1.0.3

- Fix: Windows 11 でゾンビセッションが残り続ける問題を修正（`wmic` → PowerShell に差し替え）

## 1.0.2

- Prune dead processes on startup — sessions whose OS process has died are marked inactive instead of resurrecting as zombies
- Record terminal PID and creation time for liveness verification (PID reuse safe)
- Add `Dump State (Debug)` command to inspect all session mappings in Output Channel

## 1.0.0

- Focus active terminal from QuickPick instead of opening a duplicate
- Fix session duplication when terminal is dragged to another window
- Custom title (`/title`) support in session list
- Session deduplication by sessionId in QuickPick

## 0.1.0

- Status bar showing live / idle session counts per project
- Quick Pick session manager: new session, continue last, resume past sessions
- Auto-restore interrupted sessions on VSCode restart
- Session discovery from `~/.claude/history.jsonl`
- File size and first prompt display in session list
- `isTransient` terminals — no ghost terminals after restart
