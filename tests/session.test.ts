import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  createSessionId,
  saveSession,
  loadSession,
  listSessions,
  getLatestSession,
} from "../src/core/session.js";
import type { ClawxSession } from "../src/types/index.js";

let testDir: string;

beforeEach(() => {
  testDir = path.join(os.tmpdir(), `clawx-test-${Date.now()}`);
});

afterEach(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

describe("session management", () => {
  it("should create unique session IDs", () => {
    const id1 = createSessionId();
    const id2 = createSessionId();
    expect(id1).not.toBe(id2);
    expect(id1).toHaveLength(16); // 8 bytes = 16 hex chars
  });

  it("should save and load a session", () => {
    const session: ClawxSession = {
      id: createSessionId(),
      startedAt: Date.now(),
      workDir: "/tmp",
      model: "test-model",
      provider: "local",
    };
    const messages = [
      { role: "user" as const, content: "hello", timestamp: Date.now() },
    ];

    saveSession(testDir, session, messages);
    const loaded = loadSession(testDir, session.id);

    expect(loaded).not.toBeNull();
    expect(loaded!.session.id).toBe(session.id);
    expect(loaded!.messages).toHaveLength(1);
    expect(loaded!.messages[0].content).toBe("hello");
  });

  it("should return null for nonexistent session", () => {
    const loaded = loadSession(testDir, "nonexistent");
    expect(loaded).toBeNull();
  });

  it("should list sessions sorted by start time", () => {
    for (let i = 0; i < 3; i++) {
      const session: ClawxSession = {
        id: createSessionId(),
        startedAt: Date.now() + i * 1000,
        workDir: "/tmp",
        model: "test",
        provider: "local",
      };
      saveSession(testDir, session, []);
    }

    const sessions = listSessions(testDir);
    expect(sessions).toHaveLength(3);
    // Should be newest first
    expect(sessions[0].startedAt).toBeGreaterThan(sessions[1].startedAt);
  });

  it("should get latest session", () => {
    const oldSession: ClawxSession = {
      id: createSessionId(),
      startedAt: 1000,
      workDir: "/tmp",
      model: "old",
      provider: "local",
    };
    const newSession: ClawxSession = {
      id: createSessionId(),
      startedAt: 2000,
      workDir: "/tmp",
      model: "new",
      provider: "local",
    };
    saveSession(testDir, oldSession, []);
    saveSession(testDir, newSession, []);

    const latest = getLatestSession(testDir);
    expect(latest).not.toBeNull();
    expect(latest!.session.model).toBe("new");
  });
});
