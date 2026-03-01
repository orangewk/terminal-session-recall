import * as vscode from "vscode";
import { SessionStore } from "./session-store";
import {
  listSessionIds,
  getSessionDisplayName,
  watchProjectDir,
} from "./claude-dir";
import type { SessionMapping } from "./types";

let cleanupWatcher: (() => void) | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const store = SessionStore.fromState(context.globalState);
  const projectPath = getProjectPath();

  // --- Status Bar ---
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBar.command = "claudeResurrect.showMenu";
  context.subscriptions.push(statusBar);

  const updateStatusBar = (): void => {
    if (!projectPath) {
      statusBar.hide();
      return;
    }
    const count = store.getByProject(projectPath).length;
    statusBar.text = `$(terminal) Claude: ${count} session${count !== 1 ? "s" : ""}`;
    statusBar.tooltip = "Claude Resurrect — Click to manage sessions";
    statusBar.show();
  };

  updateStatusBar();

  // --- Commands ---
  context.subscriptions.push(
    vscode.commands.registerCommand("claudeResurrect.showMenu", async () => {
      if (!projectPath) {
        vscode.window.showWarningMessage(
          "Claude Resurrect: No workspace folder open.",
        );
        return;
      }
      await showQuickPick(store, projectPath, updateStatusBar);
    }),

    vscode.commands.registerCommand("claudeResurrect.newSession", async () => {
      if (!projectPath) {
        vscode.window.showWarningMessage(
          "Claude Resurrect: No workspace folder open.",
        );
        return;
      }
      await startNewSession(store, projectPath, updateStatusBar);
    }),

    vscode.commands.registerCommand("claudeResurrect.resumeAll", async () => {
      if (!projectPath) {
        vscode.window.showWarningMessage(
          "Claude Resurrect: No workspace folder open.",
        );
        return;
      }
      await resumeAllSessions(store, projectPath, updateStatusBar);
    }),
  );

  // --- Session Tracking (fs.watch) ---
  if (projectPath) {
    const knownIds = new Set(listSessionIds(projectPath));

    cleanupWatcher = watchProjectDir(projectPath, knownIds, (sessionId) => {
      // A new session appeared — associate with the most recently created
      // untracked Claude terminal (if any)
      const pending = pendingTerminals.shift();
      if (pending) {
        const displayName = getSessionDisplayName(sessionId);
        const mapping: SessionMapping = {
          terminalName: pending.name,
          sessionId,
          projectPath,
          lastSeen: Date.now(),
          firstPrompt: displayName,
        };
        void store.upsert(mapping);
        updateStatusBar();
      }
    });

    context.subscriptions.push({ dispose: () => cleanupWatcher?.() });
  }

  // --- Terminal lifecycle tracking ---
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((terminal) => {
      if (projectPath) {
        void store.remove(terminal.name, projectPath);
        updateStatusBar();
      }
    }),
  );

  // --- Auto-restore on startup ---
  if (projectPath) {
    const config = vscode.workspace.getConfiguration("claudeResurrect");
    const autoRestore = config.get<boolean>("autoRestore", true);
    const ttlHours = config.get<number>("autoRestoreMaxAge", 24);

    if (autoRestore) {
      void autoRestoreSessions(store, projectPath, ttlHours, updateStatusBar);
    }
  }
}

export function deactivate(): void {
  cleanupWatcher?.();
}

// --- Pending terminal queue for session detection ---
const pendingTerminals: vscode.Terminal[] = [];

// --- Helper functions ---

function getProjectPath(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  return folders[0].uri.fsPath;
}

function getClaudePath(): string {
  return vscode.workspace
    .getConfiguration("claudeResurrect")
    .get<string>("claudePath", "claude");
}

async function startNewSession(
  store: SessionStore,
  projectPath: string,
  onUpdate: () => void,
): Promise<void> {
  const count = store.getByProject(projectPath).length;
  const name = `Claude #${count + 1}`;

  const terminal = vscode.window.createTerminal({
    name,
    cwd: projectPath,
  });
  terminal.show();
  terminal.sendText(getClaudePath());

  // Queue for session detection
  pendingTerminals.push(terminal);
  onUpdate();
}

async function resumeSession(
  mapping: SessionMapping,
): Promise<vscode.Terminal> {
  const terminal = vscode.window.createTerminal({
    name: mapping.terminalName,
    cwd: mapping.projectPath,
  });
  terminal.sendText(`${getClaudePath()} --resume ${mapping.sessionId}`);
  return terminal;
}

async function resumeAllSessions(
  store: SessionStore,
  projectPath: string,
  onUpdate: () => void,
): Promise<void> {
  const mappings = store.getByProject(projectPath);
  if (mappings.length === 0) {
    vscode.window.showInformationMessage(
      "Claude Resurrect: No saved sessions to restore.",
    );
    return;
  }

  for (const mapping of mappings) {
    await resumeSession(mapping);
  }
  onUpdate();
  vscode.window.showInformationMessage(
    `Claude Resurrect: Restored ${mappings.length} session(s).`,
  );
}

async function autoRestoreSessions(
  store: SessionStore,
  projectPath: string,
  ttlHours: number,
  onUpdate: () => void,
): Promise<void> {
  const restorable = store.getRestorable(projectPath, ttlHours);
  const expired = store.getExpired(projectPath, ttlHours);

  if (restorable.length === 0) {
    return;
  }

  for (const mapping of restorable) {
    await resumeSession(mapping);
  }
  onUpdate();

  if (expired.length > 0) {
    await store.pruneExpired(ttlHours);
    vscode.window.showInformationMessage(
      `Claude Resurrect: Restored ${restorable.length} session(s). ${expired.length} expired session(s) skipped.`,
    );
  }
}

async function showQuickPick(
  store: SessionStore,
  projectPath: string,
  onUpdate: () => void,
): Promise<void> {
  const mappings = store.getByProject(projectPath);

  interface MenuItem extends vscode.QuickPickItem {
    action: "new" | "resumeAll" | "session";
    mapping?: SessionMapping;
  }

  const items: MenuItem[] = [
    {
      label: "$(add) New Session",
      description: "Start a new Claude CLI session",
      action: "new",
    },
    {
      label: "$(debug-restart) Resume All",
      description: `Restore all ${mappings.length} saved session(s)`,
      action: "resumeAll",
    },
  ];

  if (mappings.length > 0) {
    items.push({
      label: "",
      kind: vscode.QuickPickItemKind.Separator,
      action: "new", // unused
    });

    for (const mapping of mappings) {
      const age = formatAge(mapping.lastSeen);
      items.push({
        label: `$(terminal) ${mapping.terminalName}`,
        description: mapping.firstPrompt
          ? `"${mapping.firstPrompt.slice(0, 40)}" — ${age}`
          : `${mapping.sessionId.slice(0, 8)}... — ${age}`,
        action: "session",
        mapping,
      });
    }
  }

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Claude Resurrect",
  });

  if (!selected) {
    return;
  }

  switch (selected.action) {
    case "new":
      await startNewSession(store, projectPath, onUpdate);
      break;
    case "resumeAll":
      await resumeAllSessions(store, projectPath, onUpdate);
      break;
    case "session":
      if (selected.mapping) {
        const terminal = await resumeSession(selected.mapping);
        terminal.show();
      }
      break;
  }
}

function formatAge(timestamp: number): string {
  const hours = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60));
  if (hours < 1) {
    return "just now";
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
