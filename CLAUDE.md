# Terminal Session Recall — Development Guide

## Project Overview

VS Code extension that automatically restores Claude Code CLI sessions after restart. Supports session presets, process inspection (Linux), terminal rename sync, and multi-user operation.

## Development Commands

```bash
npm run typecheck  # Type check
npm run test       # Vitest tests
npm run compile    # Build (esbuild → out/)
npm run watch      # Watch mode + auto-build
npm run package    # .vsix package
```

**Quality gate** (run before finishing work): `npm run typecheck && npm run test && npm run compile`

**VSIX build** (requires Node 20): `bash -l -c "nvm exec 20 npx @vscode/vsce package"`

## Architecture

### ~/.claude/ Access Constraints

- `claude-dir.ts` and `process-inspector.ts` are the only modules that access `~/.claude/`
- No other module may use `fs` to access `~/.claude/` directly
- Read-only access only. No write APIs are used

### Key Modules

| File | Vitest Testable | Role |
|------|:-:|------|
| claude-dir.ts | Yes | Session discovery, history reading, display info extraction |
| process-inspector.ts | Yes | Linux procfs-based Claude process detection (session ID, cwd, user, args) |
| session-store.ts | Yes | In-memory session store with persistence callback (DI) |
| normalize-path.ts | Yes | Pure path normalization function |
| extension.ts | No | Main extension: commands, QuickPick, status bar, terminal lifecycle (F5 debug) |
| preset-webview.ts | No | Webview preset manager panel (F5 debug) |

### Session Store

- `getByProject()` uses `startsWith` prefix matching — workspace root finds all subdirectory mappings
- `pruneDeadProcesses()` checks PIDs via `process-check.ts` and marks dead active sessions as inactive
- `pruneExpired()` removes entries older than 336 hours (14 days)

### Debug Logging

- Extension logs to Output Channel "TS Recall Log" with `[tag]` prefixes
- Key tags: `[status-bar]`, `[rename-poll]`, `[terminal-open]`, `[terminal-close]`, `[init]`, `[adopt]`

## Coding Style

- TypeScript strict
- Immutable operations (spread for new objects)
- No `any` (use `unknown` instead)
