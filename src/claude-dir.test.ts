import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

vi.mock("node:fs");
vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/home/testuser"),
}));

import { discoverSessions, isValidSessionId, readHistoryEntries, getClaudeDir, readFirstPrompt } from "./claude-dir";

/** Build a Stats-like mock for a regular file/directory (not a symlink) */
function makeStatsMock(size = 0): fs.Stats {
  return { isSymbolicLink: () => false, size } as unknown as fs.Stats;
}

/** Build a Stats-like mock for a symbolic link */
function makeSymlinkStatsMock(): fs.Stats {
  return { isSymbolicLink: () => true, size: 0 } as unknown as fs.Stats;
}

// Valid UUID-format session IDs used across tests
const UUID_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const UUID_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const UUID_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const UUID_OLD = "00000000-0000-0000-0000-000000000001";
const UUID_NEW = "00000000-0000-0000-0000-000000000002";
const UUID_MID = "00000000-0000-0000-0000-000000000003";

describe("getClaudeDir", () => {
  it("returns ~/.claude", () => {
    expect(getClaudeDir()).toBe(path.join("/home/testuser", ".claude"));
  });
});

describe("readHistoryEntries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when file does not exist", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(readHistoryEntries()).toEqual([]);
  });

  it("parses valid JSONL lines", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      [
        JSON.stringify({ display: "hello", pastedContents: {}, timestamp: 1000, project: "C:\\dev\\foo", sessionId: UUID_A }),
        JSON.stringify({ display: "world", pastedContents: {}, timestamp: 2000, project: "C:\\dev\\foo", sessionId: UUID_B }),
      ].join("\n"),
    );

    const entries = readHistoryEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0].display).toBe("hello");
    expect(entries[1].sessionId).toBe(UUID_B);
  });

  it("skips malformed lines", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      [
        JSON.stringify({ display: "good", pastedContents: {}, timestamp: 1000, project: "C:\\dev\\foo", sessionId: UUID_A }),
        "not json {{{",
        JSON.stringify({ display: "also good", pastedContents: {}, timestamp: 2000, project: "C:\\dev\\foo", sessionId: UUID_B }),
      ].join("\n"),
    );

    const entries = readHistoryEntries();
    expect(entries).toHaveLength(2);
  });
});

describe("discoverSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: projectsDir exists and is not a symlink; project candidate dir does not exist
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.lstatSync).mockReturnValue(makeStatsMock());
    vi.mocked(fs.readdirSync).mockReturnValue([]);
  });

  it("returns empty array when no history file", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.lstatSync).mockImplementation(() => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    expect(discoverSessions("C:\\dev\\foo")).toEqual([]);
  });

  it("filters sessions by project path (case-insensitive)", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      [
        JSON.stringify({ display: "match", pastedContents: {}, timestamp: 1000, project: "C:\\dev\\my-project", sessionId: UUID_A }),
        JSON.stringify({ display: "no match", pastedContents: {}, timestamp: 2000, project: "C:\\dev\\other", sessionId: UUID_B }),
        JSON.stringify({ display: "case match", pastedContents: {}, timestamp: 3000, project: "c:\\dev\\My-Project", sessionId: UUID_C }),
      ].join("\n"),
    );

    const sessions = discoverSessions("C:\\dev\\my-project");
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.sessionId)).toEqual([UUID_C, UUID_A]);
  });

  it("deduplicates by sessionId and keeps latest timestamp", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      [
        JSON.stringify({ display: "first msg", pastedContents: {}, timestamp: 1000, project: "C:\\dev\\foo", sessionId: UUID_A }),
        JSON.stringify({ display: "second msg", pastedContents: {}, timestamp: 5000, project: "C:\\dev\\foo", sessionId: UUID_A }),
        JSON.stringify({ display: "third msg", pastedContents: {}, timestamp: 3000, project: "C:\\dev\\foo", sessionId: UUID_A }),
      ].join("\n"),
    );

    const sessions = discoverSessions("C:\\dev\\foo");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].firstPrompt).toBe("first msg");
    expect(sessions[0].lastSeen).toBe(5000);
  });

  it("sorts by lastSeen descending", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      [
        JSON.stringify({ display: "old", pastedContents: {}, timestamp: 1000, project: "C:\\dev\\foo", sessionId: UUID_OLD }),
        JSON.stringify({ display: "new", pastedContents: {}, timestamp: 9000, project: "C:\\dev\\foo", sessionId: UUID_NEW }),
        JSON.stringify({ display: "mid", pastedContents: {}, timestamp: 5000, project: "C:\\dev\\foo", sessionId: UUID_MID }),
      ].join("\n"),
    );

    const sessions = discoverSessions("C:\\dev\\foo");
    expect(sessions.map((s) => s.sessionId)).toEqual([UUID_NEW, UUID_MID, UUID_OLD]);
  });

  it("normalizes Windows backslash vs forward slash", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ display: "hi", pastedContents: {}, timestamp: 1000, project: "C:\\dev\\foo", sessionId: UUID_A }),
    );

    const sessions = discoverSessions("C:/dev/foo");
    expect(sessions).toHaveLength(1);
  });

  it("filters out sessions with invalid session IDs", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      [
        JSON.stringify({ display: "valid", pastedContents: {}, timestamp: 1000, project: "C:\\dev\\foo", sessionId: "550e8400-e29b-41d4-a716-446655440000" }),
        JSON.stringify({ display: "injection", pastedContents: {}, timestamp: 2000, project: "C:\\dev\\foo", sessionId: "../../etc/passwd" }),
        JSON.stringify({ display: "empty", pastedContents: {}, timestamp: 3000, project: "C:\\dev\\foo", sessionId: "" }),
      ].join("\n"),
    );

    const sessions = discoverSessions("C:\\dev\\foo");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  describe("symlink protection", () => {
    it("returns fileSize 0 when session .jsonl is a symbolic link", () => {
      // projectsDir and candidate project dir are real; session .jsonl file is a symlink
      vi.mocked(fs.lstatSync).mockImplementation((p) => {
        if (typeof p === "string" && p.endsWith(".jsonl")) {
          return makeSymlinkStatsMock();
        }
        return makeStatsMock(999);
      });
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ display: "symlinked", pastedContents: {}, timestamp: 1000, project: "C:\\dev\\foo", sessionId: UUID_A }),
      );

      const sessions = discoverSessions("C:\\dev\\foo");
      expect(sessions).toHaveLength(1);
      expect(sessions[0].fileSize).toBe(0);
    });

    it("ignores candidate project directory that is a symbolic link", () => {
      // projectsDir is real; candidate project dir is a symlink => findProjectDir returns undefined
      vi.mocked(fs.lstatSync).mockImplementation((p) => {
        if (typeof p === "string" && p.endsWith("projects")) {
          return makeStatsMock();
        }
        // Every other lstatSync call (candidate dir, .jsonl) hits a symlink
        return makeSymlinkStatsMock();
      });
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ display: "test", pastedContents: {}, timestamp: 1000, project: "C:\\dev\\foo", sessionId: UUID_A }),
      );

      const sessions = discoverSessions("C:\\dev\\foo");
      // Session is found from history, but fileSize is 0 (no valid project dir)
      expect(sessions).toHaveLength(1);
      expect(sessions[0].fileSize).toBe(0);
    });

    it("ignores project directory found via case-fallback scan when it is a symbolic link", () => {
      // projectsDir is real; slug candidate doesn't exist (throws); fallback dir is a symlink
      const projectsDir = "/home/testuser/.claude/projects";
      vi.mocked(fs.lstatSync).mockImplementation((p) => {
        if (p === projectsDir) return makeStatsMock();
        // candidate by slug and scanned fallback dir are symlinks
        return makeSymlinkStatsMock();
      });
      vi.mocked(fs.readdirSync).mockReturnValue(["C-dev-foo"] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ display: "test", pastedContents: {}, timestamp: 1000, project: "C:\\dev\\foo", sessionId: UUID_A }),
      );

      const sessions = discoverSessions("C:\\dev\\foo");
      expect(sessions).toHaveLength(1);
      expect(sessions[0].fileSize).toBe(0);
    });
  });
});

describe("readFirstPrompt", () => {
  const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: projectsDir and candidate project dir exist and are not symlinks
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.lstatSync).mockReturnValue(makeStatsMock());
    vi.mocked(fs.readdirSync).mockReturnValue([]);
  });

  it("returns undefined when sessionId is invalid", () => {
    expect(readFirstPrompt("C:\\dev\\foo", "../../etc/passwd")).toBeUndefined();
  });

  it("returns undefined when the JSONL file does not exist", () => {
    vi.mocked(fs.lstatSync).mockImplementation((p) => {
      if (typeof p === "string" && p.endsWith(".jsonl")) {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }
      return makeStatsMock();
    });

    expect(readFirstPrompt("C:\\dev\\foo", VALID_UUID)).toBeUndefined();
  });

  it("returns undefined when the JSONL file is a symbolic link", () => {
    vi.mocked(fs.lstatSync).mockImplementation((p) => {
      if (typeof p === "string" && p.endsWith(".jsonl")) {
        return makeSymlinkStatsMock();
      }
      return makeStatsMock();
    });

    expect(readFirstPrompt("C:\\dev\\foo", VALID_UUID)).toBeUndefined();
  });

  it("returns undefined when the file is empty", () => {
    vi.mocked(fs.openSync).mockReturnValue(3 as unknown as number);
    vi.mocked(fs.readFileSync).mockImplementation((fd) => {
      if (typeof fd === "number") return "";
      throw new Error("unexpected readFileSync call");
    });
    vi.mocked(fs.closeSync).mockReturnValue(undefined);

    expect(readFirstPrompt("C:\\dev\\foo", VALID_UUID)).toBeUndefined();
  });

  it("returns the first user message text (string content)", () => {
    const lines = [
      JSON.stringify({ type: "system", message: { content: "system msg" } }),
      JSON.stringify({ type: "user", message: { content: "hello world" } }),
      JSON.stringify({ type: "assistant", message: { content: "hi" } }),
    ].join("\n");

    vi.mocked(fs.openSync).mockReturnValue(3 as unknown as number);
    vi.mocked(fs.readFileSync).mockImplementation((fd) => {
      if (typeof fd === "number") return lines;
      throw new Error("unexpected readFileSync call");
    });
    vi.mocked(fs.closeSync).mockReturnValue(undefined);

    expect(readFirstPrompt("C:\\dev\\foo", VALID_UUID)).toBe("hello world");
  });

  it("returns the first user message text (array content)", () => {
    const lines = [
      JSON.stringify({
        type: "user",
        message: {
          content: [
            { type: "image", data: "..." },
            { type: "text", text: "describe this image" },
          ],
        },
      }),
    ].join("\n");

    vi.mocked(fs.openSync).mockReturnValue(3 as unknown as number);
    vi.mocked(fs.readFileSync).mockImplementation((fd) => {
      if (typeof fd === "number") return lines;
      throw new Error("unexpected readFileSync call");
    });
    vi.mocked(fs.closeSync).mockReturnValue(undefined);

    expect(readFirstPrompt("C:\\dev\\foo", VALID_UUID)).toBe("describe this image");
  });

  it("truncates text longer than 80 characters", () => {
    const longText = "a".repeat(100);
    const lines = JSON.stringify({
      type: "user",
      message: { content: longText },
    });

    vi.mocked(fs.openSync).mockReturnValue(3 as unknown as number);
    vi.mocked(fs.readFileSync).mockImplementation((fd) => {
      if (typeof fd === "number") return lines;
      throw new Error("unexpected readFileSync call");
    });
    vi.mocked(fs.closeSync).mockReturnValue(undefined);

    expect(readFirstPrompt("C:\\dev\\foo", VALID_UUID)).toBe("a".repeat(80));
  });

  it("returns undefined when no user entry exists in the file", () => {
    const lines = [
      JSON.stringify({ type: "system", message: { content: "system msg" } }),
      JSON.stringify({ type: "assistant", message: { content: "hi" } }),
    ].join("\n");

    vi.mocked(fs.openSync).mockReturnValue(3 as unknown as number);
    vi.mocked(fs.readFileSync).mockImplementation((fd) => {
      if (typeof fd === "number") return lines;
      throw new Error("unexpected readFileSync call");
    });
    vi.mocked(fs.closeSync).mockReturnValue(undefined);

    expect(readFirstPrompt("C:\\dev\\foo", VALID_UUID)).toBeUndefined();
  });

  it("skips malformed lines and continues", () => {
    const lines = [
      "not json {{{",
      JSON.stringify({ type: "user", message: { content: "valid" } }),
    ].join("\n");

    vi.mocked(fs.openSync).mockReturnValue(3 as unknown as number);
    vi.mocked(fs.readFileSync).mockImplementation((fd) => {
      if (typeof fd === "number") return lines;
      throw new Error("unexpected readFileSync call");
    });
    vi.mocked(fs.closeSync).mockReturnValue(undefined);

    expect(readFirstPrompt("C:\\dev\\foo", VALID_UUID)).toBe("valid");
  });
});

describe("isValidSessionId", () => {
  it("accepts a valid lowercase UUID", () => {
    expect(isValidSessionId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("accepts another valid UUID", () => {
    expect(isValidSessionId("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidSessionId("")).toBe(false);
  });

  it("rejects a UUID with uppercase letters", () => {
    expect(isValidSessionId("550E8400-E29B-41D4-A716-446655440000")).toBe(false);
  });

  it("rejects a path traversal injection string", () => {
    expect(isValidSessionId("../../etc/passwd")).toBe(false);
  });

  it("rejects a string with shell metacharacters", () => {
    expect(isValidSessionId("abc; rm -rf /")).toBe(false);
  });

  it("rejects a UUID with wrong segment lengths", () => {
    expect(isValidSessionId("550e8400-e29b-41d4-a716-44665544000")).toBe(false);
  });

  it("rejects a plain alphanumeric string (no hyphens)", () => {
    expect(isValidSessionId("550e8400e29b41d4a716446655440000")).toBe(false);
  });
});
