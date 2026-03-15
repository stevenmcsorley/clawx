#!/usr/bin/env node
/**
 * Clawdex CLI — terminal-first coding/execution agent.
 *
 * EXTRACTION NOTE:
 * OpenClaw's CLI entry (openclaw.mjs → entry.ts → cli/) handles:
 * - 40+ CLI commands (agent, channel, config, daemon, gateway, install, ...)
 * - Channel initialization and routing
 * - Plugin discovery and loading
 * - Gateway server startup
 * - Daemon management
 * - Update checking
 *
 * We DISCARD all of that. Our CLI has three modes:
 * 1. `clawdex run "prompt"` — single-shot: run a task and exit
 * 2. `clawdex chat` — interactive REPL
 * 3. `clawdex continue` — resume the last session
 */

import { Command } from "commander";
import { loadConfig } from "../config/index.js";
import { runAgent, type AgentMessage } from "../core/agent.js";
import { createStreamRenderer } from "../core/streaming.js";
import {
  createSessionId,
  saveSession,
  loadSession,
  getLatestSession,
  listSessions,
} from "../core/session.js";
import type { ClawdexSession } from "../types/index.js";
import { log } from "../utils/logger.js";
import { startRepl } from "./repl.js";

const program = new Command();

program
  .name("clawdex")
  .description("Lean coding/execution agent — extracted from OpenClaw core")
  .version("0.1.0");

program
  .command("run")
  .description("Run a task and exit")
  .argument("<prompt>", "Task description for the agent")
  .option("-m, --model <model>", "Model to use")
  .option("-p, --provider <provider>", "Provider (openai-completions, anthropic, etc.)")
  .option("-u, --base-url <url>", "Provider base URL")
  .option("-d, --work-dir <dir>", "Working directory")
  .option("-v, --verbose", "Verbose logging")
  .action(async (prompt: string, opts: Record<string, string | boolean>) => {
    if (opts.verbose) log.setLogLevel("debug");

    const config = loadConfig({
      model: opts.model as string | undefined,
      provider: opts.provider as string | undefined,
      baseUrl: opts.baseUrl as string | undefined,
      workDir: opts.workDir as string | undefined,
    });

    const sessionId = createSessionId();
    const session: ClawdexSession = {
      id: sessionId,
      startedAt: Date.now(),
      workDir: config.workDir,
      model: config.model,
      provider: config.provider,
    };

    const renderer = createStreamRenderer();

    try {
      const result = await runAgent(config, {
        prompt,
        onEvent: (event) => renderer.onEvent(event),
      });

      renderer.finish();
      saveSession(config.sessionDir, session, result.messages);
      process.exit(result.aborted ? 1 : 0);
    } catch (e) {
      console.error(`Fatal: ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  });

program
  .command("chat")
  .description("Interactive chat session")
  .option("-m, --model <model>", "Model to use")
  .option("-p, --provider <provider>", "Provider")
  .option("-u, --base-url <url>", "Provider base URL")
  .option("-d, --work-dir <dir>", "Working directory")
  .option("-v, --verbose", "Verbose logging")
  .option("-c, --continue", "Continue the last session")
  .action(async (opts: Record<string, string | boolean>) => {
    if (opts.verbose) log.setLogLevel("debug");

    const config = loadConfig({
      model: opts.model as string | undefined,
      provider: opts.provider as string | undefined,
      baseUrl: opts.baseUrl as string | undefined,
      workDir: opts.workDir as string | undefined,
    });

    let messages: AgentMessage[] = [];
    let sessionId = createSessionId();

    if (opts.continue) {
      const latest = getLatestSession(config.sessionDir);
      if (latest) {
        messages = latest.messages;
        sessionId = latest.session.id;
        log.info(`Resuming session ${sessionId}`);
      }
    }

    await startRepl(config, sessionId, messages);
  });

program
  .command("continue")
  .description("Continue the last session")
  .option("-v, --verbose", "Verbose logging")
  .action(async (opts: Record<string, string | boolean>) => {
    if (opts.verbose) log.setLogLevel("debug");
    const config = loadConfig();
    const latest = getLatestSession(config.sessionDir);
    if (!latest) {
      console.error("No previous session found.");
      process.exit(1);
    }
    log.info(`Resuming session ${latest.session.id}`);
    await startRepl(config, latest.session.id, latest.messages);
  });

program
  .command("sessions")
  .description("List recent sessions")
  .action(() => {
    const config = loadConfig();
    const sessions = listSessions(config.sessionDir);
    if (sessions.length === 0) {
      console.log("No sessions found.");
      return;
    }
    for (const s of sessions.slice(0, 20)) {
      const date = new Date(s.startedAt).toLocaleString();
      console.log(`${s.id}  ${date}  ${s.model}  ${s.workDir}`);
    }
  });

program.parse();
