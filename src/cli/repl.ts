/**
 * Interactive REPL for Clawdex.
 *
 * Simple readline-based REPL that feeds user input to the agent loop
 * and streams results back. Supports multi-turn conversations with
 * session persistence.
 */

import readline from "node:readline";
import chalk from "chalk";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ClawdexConfig, ClawdexSession } from "../types/index.js";
import { runAgent } from "../core/agent.js";
import { createStreamRenderer } from "../core/streaming.js";
import { saveSession } from "../core/session.js";
import { log } from "../utils/logger.js";

export async function startRepl(
  config: ClawdexConfig,
  sessionId: string,
  existingMessages: AgentMessage[],
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    prompt: chalk.green("clawdex> "),
  });

  let messages = [...existingMessages];
  let abortController: AbortController | null = null;

  const session: ClawdexSession = {
    id: sessionId,
    startedAt: Date.now(),
    workDir: config.workDir,
    model: config.model,
    provider: config.provider,
  };

  console.error(chalk.bold("Clawdex") + chalk.gray(` — ${config.model} @ ${config.provider}`));
  console.error(chalk.gray(`Working directory: ${config.workDir}`));
  console.error(chalk.gray(`Type your request. Ctrl+C to cancel, Ctrl+D or "exit" to quit.\n`));

  rl.prompt();

  rl.on("line", async (line: string) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    // Commands
    if (input === "exit" || input === "quit" || input === "/exit") {
      saveSession(config.sessionDir, session, messages);
      rl.close();
      return;
    }

    if (input === "/clear") {
      messages = [];
      console.error(chalk.gray("Session cleared."));
      rl.prompt();
      return;
    }

    if (input === "/save") {
      saveSession(config.sessionDir, session, messages);
      console.error(chalk.gray(`Session saved: ${sessionId}`));
      rl.prompt();
      return;
    }

    if (input === "/info") {
      console.error(chalk.gray(`Session: ${sessionId}`));
      console.error(chalk.gray(`Model: ${config.model}`));
      console.error(chalk.gray(`Provider: ${config.provider}`));
      console.error(chalk.gray(`Base URL: ${config.baseUrl}`));
      console.error(chalk.gray(`Messages: ${messages.length}`));
      console.error(chalk.gray(`Work dir: ${config.workDir}`));
      rl.prompt();
      return;
    }

    if (input.startsWith("/")) {
      console.error(chalk.yellow(`Unknown command: ${input}`));
      console.error(chalk.gray("Commands: /clear, /save, /info, /exit"));
      rl.prompt();
      return;
    }

    // Run agent
    abortController = new AbortController();
    const renderer = createStreamRenderer();

    try {
      const result = await runAgent(config, {
        prompt: input,
        messages,
        onEvent: (event) => renderer.onEvent(event),
        signal: abortController.signal,
      });

      renderer.finish();
      messages = result.messages;

      // Auto-save after each turn
      saveSession(config.sessionDir, session, messages);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        console.error(chalk.yellow("\n[aborted]"));
      } else {
        console.error(chalk.red(`\nError: ${e instanceof Error ? e.message : e}`));
      }
    }

    abortController = null;
    rl.prompt();
  });

  // Handle Ctrl+C — abort current run or exit
  rl.on("SIGINT", () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    } else {
      console.error(chalk.gray("\nUse Ctrl+D or 'exit' to quit."));
      rl.prompt();
    }
  });

  rl.on("close", () => {
    saveSession(config.sessionDir, session, messages);
    console.error(chalk.gray("\nSession saved. Goodbye."));
    process.exit(0);
  });

  // Return a promise that resolves when the REPL closes
  return new Promise((resolve) => {
    rl.on("close", () => resolve());
  });
}
