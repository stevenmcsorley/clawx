#!/usr/bin/env node
/**
 * Clawx CLI — terminal-first coding/execution agent.
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
 * We DISCARD all of that. Our CLI has these modes:
 * 1. `clawx` — default: TUI mode (rich terminal UI from pi-coding-agent)
 * 2. `clawx run "prompt"` — single-shot: run a task and exit
 * 3. `clawx chat` — basic readline REPL (fallback)
 * 4. `clawx continue` — resume the last session
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
import type { ClawxSession } from "../types/index.js";
import { log } from "../utils/logger.js";
import { startRepl } from "./repl.js";
import { startTui } from "./tui.js";

const program = new Command();

program
  .name("clawx")
  .description("Lean coding/execution agent — extracted from OpenClaw core")
  .version("0.1.0");

// Default action: launch TUI when no subcommand given
// e.g. `clawx` or `clawx "build me a flask app"`
program
  .argument("[prompt]", "Optional initial message for TUI mode")
  .option("-m, --model <model>", "Model to use")
  .option("-p, --provider <provider>", "Provider")
  .option("-u, --base-url <url>", "Provider base URL")
  .option("-d, --work-dir <dir>", "Working directory")
  .option("-v, --verbose", "Verbose logging")
  .option("--basic", "Use basic readline REPL instead of TUI")
  .action(async (prompt: string | undefined, opts: Record<string, string | boolean>) => {
    if (opts.verbose) log.setLogLevel("debug");

    const config = loadConfig({
      model: opts.model as string | undefined,
      provider: opts.provider as string | undefined,
      baseUrl: opts.baseUrl as string | undefined,
      workDir: opts.workDir as string | undefined,
    });

    if (opts.basic) {
      // Basic readline REPL fallback
      const sessionId = createSessionId();
      await startRepl(config, sessionId, []);
      return;
    }

    // TUI mode (rich terminal UI)
    try {
      await startTui(config, {
        initialMessage: prompt,
        verbose: opts.verbose as boolean | undefined,
      });
    } catch (e) {
      // If TUI fails (e.g. missing terminal capabilities), fall back to basic REPL
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`TUI failed (${msg}), falling back to basic REPL...`);
      const sessionId = createSessionId();
      await startRepl(config, sessionId, []);
    }
  });

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
    const session: ClawxSession = {
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
