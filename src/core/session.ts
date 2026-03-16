/**
 * Session persistence for Clawx.
 *
 * EXTRACTION NOTE:
 * OpenClaw's session store (config/sessions/store.ts, 400+ lines) handles:
 * - TTL-based in-memory caching (45s)
 * - Atomic disk writes with lock acquisition
 * - Legacy session key migration
 * - Delivery context normalization
 * - Entry count capping, stale pruning, disk budget enforcement
 * - File rotation on size limits
 *
 * pi-coding-agent provides a SessionManager that handles session persistence
 * with file-based storage, entries, compaction, and branching.
 *
 * For Clawx, we use a SIMPLER approach:
 * - JSON file per session in ~/.clawx/sessions/
 * - Session = id + messages + metadata
 * - Load/save by session ID
 * - List recent sessions
 * - No caching, no TTL, no locking, no rotation
 *
 * This replaces the OpenClaw session store with ~100 lines.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ClawxSession } from "../types/index.js";
import { log } from "../utils/logger.js";

interface SessionData {
  session: ClawxSession;
  messages: AgentMessage[];
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sessionPath(dir: string, id: string): string {
  return path.join(dir, `${id}.json`);
}

export function createSessionId(): string {
  return crypto.randomBytes(8).toString("hex");
}

export function saveSession(
  sessionDir: string,
  session: ClawxSession,
  messages: AgentMessage[],
): void {
  ensureDir(sessionDir);
  const data: SessionData = { session, messages };
  const filePath = sessionPath(sessionDir, session.id);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  log.debug(`Session saved: ${session.id}`);
}

export function loadSession(
  sessionDir: string,
  id: string,
): SessionData | null {
  const filePath = sessionPath(sessionDir, id);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as SessionData;
  } catch (e) {
    log.warn(`Failed to load session ${id}: ${e}`);
    return null;
  }
}

export function listSessions(
  sessionDir: string,
): ClawxSession[] {
  ensureDir(sessionDir);
  try {
    const files = fs.readdirSync(sessionDir).filter((f) => f.endsWith(".json"));
    const sessions: ClawxSession[] = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(sessionDir, file), "utf-8");
        const data = JSON.parse(raw) as SessionData;
        sessions.push(data.session);
      } catch {
        // Skip corrupt sessions
      }
    }
    return sessions.sort((a, b) => b.startedAt - a.startedAt);
  } catch {
    return [];
  }
}

export function getLatestSession(
  sessionDir: string,
): SessionData | null {
  const sessions = listSessions(sessionDir);
  if (sessions.length === 0) return null;
  return loadSession(sessionDir, sessions[0].id);
}
