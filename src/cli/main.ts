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

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Command } from "commander";
import { loadConfig, getGlobalConfigDir, getGlobalConfigPath } from "../config/index.js";
import { runAgent, type AgentMessage, ToolsNotSupportedError } from "../core/agent.js";
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
import { VERSION, printBannerCompact } from "./banner.js";

const program = new Command();

program
  .name("clawx")
  .description("Terminal-first coding agent — runs locally with Ollama, DeepSeek, OpenAI, or any OpenAI-compatible endpoint")
  .version(VERSION);

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
      if (e instanceof ToolsNotSupportedError) {
        console.error(`\n  Model '${config.model}' does not support tool calling.`);
        console.error(`  Switch to a compatible model: clawx use deepseek`);
        console.error(`  Or use chat mode: clawx chat\n`);
        console.error(`  Run 'clawx profiles' to see all available profiles.`);
        process.exit(1);
      }
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

    printBannerCompact(config.model, config.provider);
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
      if (e instanceof ToolsNotSupportedError) {
        renderer.finish();
        console.error(`\n  Model '${config.model}' does not support tool calling.`);
        console.error(`  The agent loop requires structured tool calls to work.\n`);
        console.error(`  Options:`);
        console.error(`    1. Switch to a model that supports tools:`);
        console.error(`       clawx use deepseek`);
        console.error(`       clawx use glm-flash`);
        console.error(`       clawx use qwen35-35b\n`);
        console.error(`    2. Use chat mode (no tools, just conversation):`);
        console.error(`       clawx chat\n`);
        console.error(`  Run 'clawx profiles' to see all available profiles.`);
        process.exit(1);
      }
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

program
  .command("init")
  .description("Set up Clawx — configure provider, model, and API key")
  .action(async () => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const ask = (q: string, def?: string): Promise<string> =>
      new Promise((resolve) => {
        const suffix = def ? ` [${def}]` : "";
        rl.question(`${q}${suffix}: `, (answer) =>
          resolve(answer.trim() || def || ""),
        );
      });

    console.log("\n  Clawx Setup\n");

    console.log("  Providers:");
    console.log("    1. ollama       — Local models via Ollama (free)");
    console.log("    2. deepseek     — DeepSeek API (very cheap)");
    console.log("    3. openai       — OpenAI API (GPT-4o, etc.)");
    console.log("    4. anthropic    — Anthropic API (Claude)");
    console.log("    5. local        — Any OpenAI-compatible endpoint\n");

    const providerChoice = await ask("  Choose provider (1-5)", "1");
    const providerMap: Record<string, { provider: string; baseUrl: string; model: string; needsKey: boolean }> = {
      "1": { provider: "ollama", baseUrl: "http://localhost:11434/v1", model: "glm-4.7-flash:latest", needsKey: false },
      "2": { provider: "deepseek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", needsKey: true },
      "3": { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o", needsKey: true },
      "4": { provider: "anthropic", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-20250514", needsKey: true },
      "5": { provider: "local", baseUrl: "http://localhost:8080/v1", model: "my-model", needsKey: false },
      ollama: { provider: "ollama", baseUrl: "http://localhost:11434/v1", model: "glm-4.7-flash:latest", needsKey: false },
      deepseek: { provider: "deepseek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", needsKey: true },
      openai: { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o", needsKey: true },
      anthropic: { provider: "anthropic", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-20250514", needsKey: true },
      local: { provider: "local", baseUrl: "http://localhost:8080/v1", model: "my-model", needsKey: false },
    };

    const selected = providerMap[providerChoice] || providerMap["1"];
    const baseUrl = await ask("  Base URL", selected.baseUrl);
    const model = await ask("  Model", selected.model);

    let apiKey = "not-needed";
    if (selected.needsKey) {
      apiKey = await ask("  API key");
      if (!apiKey) {
        console.error("\n  API key is required for this provider.");
        rl.close();
        process.exit(1);
      }
    }

    const maxTokens = await ask("  Max output tokens", "16384");

    rl.close();

    // Write config
    const configDir = getGlobalConfigDir();
    fs.mkdirSync(configDir, { recursive: true });

    const configContent = [
      `# Clawx config — generated by clawx init`,
      `CLAWDEX_PROVIDER=${selected.provider}`,
      `CLAWDEX_BASE_URL=${baseUrl}`,
      `CLAWDEX_MODEL=${model}`,
      `CLAWDEX_API_KEY=${apiKey}`,
      `CLAWDEX_THINKING_LEVEL=off`,
      `CLAWDEX_MAX_TOKENS=${maxTokens}`,
      `CLAWDEX_EXEC_TIMEOUT=120000`,
      "",
    ].join("\n");

    const configPath = getGlobalConfigPath();
    fs.writeFileSync(configPath, configContent, "utf-8");

    console.log(`\n  Config saved to ${configPath}`);

    // Auto-save as a profile
    const profileName = model.replace(/[:/]/g, "-").replace(/:latest$/, "");
    const profilesDir = path.join(configDir, "profiles");
    fs.mkdirSync(profilesDir, { recursive: true });
    fs.writeFileSync(path.join(profilesDir, profileName), configContent, "utf-8");
    fs.writeFileSync(path.join(configDir, "active-profile"), profileName, "utf-8");
    console.log(`  Profile '${profileName}' saved. Switch back anytime with: clawx use ${profileName}`);

    // For Ollama: check if model is available and offer to pull
    if (selected.provider === "ollama") {
      try {
        const ollamaBase = baseUrl.replace(/\/v1\/?$/, "");
        const res = await fetch(`${ollamaBase}/api/tags`);
        if (res.ok) {
          const data = (await res.json()) as { models?: Array<{ name: string }> };
          const models = data.models || [];
          const found = models.some(
            (m) => m.name === model || m.name === `${model}:latest` || `${m.name}:latest` === model,
          );
          if (!found) {
            const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
            const pullAnswer = await new Promise<string>((resolve) => {
              rl2.question(`\n  Model '${model}' not found in Ollama. Pull it now? [Y/n] `, (a) => {
                rl2.close();
                resolve(a.trim().toLowerCase() || "y");
              });
            });
            if (pullAnswer === "y" || pullAnswer === "yes") {
              console.log(`\n  Pulling ${model}... (this may take a while)\n`);
              const { execSync } = await import("node:child_process");
              try {
                execSync(`ollama pull ${model}`, { stdio: "inherit" });
                console.log(`\n  Model pulled successfully.`);
              } catch {
                console.error(`\n  Failed to pull model. Run manually: ollama pull ${model}`);
              }
            } else {
              console.log(`\n  Skipped. Run 'ollama pull ${model}' before using clawx.`);
            }
          } else {
            console.log(`  Model '${model}' is available in Ollama.`);
          }
        }
      } catch {
        console.log(`  Could not reach Ollama at ${baseUrl} — make sure 'ollama serve' is running.`);
      }
    }

    console.log(`\n  Run 'clawx' to start!\n`);
  });

// --- Profile management ---

function getProfilesDir(): string {
  return path.join(getGlobalConfigDir(), "profiles");
}

function getActiveProfileName(): string | null {
  const activeFile = path.join(getGlobalConfigDir(), "active-profile");
  if (fs.existsSync(activeFile)) return fs.readFileSync(activeFile, "utf-8").trim();
  return null;
}

function setActiveProfileName(name: string): void {
  fs.writeFileSync(path.join(getGlobalConfigDir(), "active-profile"), name, "utf-8");
}

function parseProfileConfig(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) result[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return result;
}

program
  .command("add")
  .description("Save current config as a named profile")
  .argument("<name>", "Profile name (e.g. deepseek, qwen35, gpt4)")
  .action((name: string) => {
    const profilesDir = getProfilesDir();
    fs.mkdirSync(profilesDir, { recursive: true });

    const configPath = getGlobalConfigPath();
    if (!fs.existsSync(configPath)) {
      console.error("  No active config found. Run 'clawx init' first.");
      process.exit(1);
    }

    const content = fs.readFileSync(configPath, "utf-8");
    const profilePath = path.join(profilesDir, name);
    fs.writeFileSync(profilePath, content, "utf-8");
    setActiveProfileName(name);

    const parsed = parseProfileConfig(content);
    console.log(`\n  Profile '${name}' saved.`);
    console.log(`  → ${parsed.CLAWDEX_MODEL || "unknown"} via ${parsed.CLAWDEX_PROVIDER || "unknown"}\n`);
  });

program
  .command("use")
  .description("Switch to a saved profile")
  .argument("<name>", "Profile name")
  .action((name: string) => {
    const profilePath = path.join(getProfilesDir(), name);
    if (!fs.existsSync(profilePath)) {
      console.error(`\n  Profile '${name}' not found.`);
      console.error(`  Run 'clawx profiles' to see available profiles.\n`);
      process.exit(1);
    }

    const content = fs.readFileSync(profilePath, "utf-8");
    const configPath = getGlobalConfigPath();
    fs.writeFileSync(configPath, content, "utf-8");
    setActiveProfileName(name);

    const parsed = parseProfileConfig(content);
    console.log(`\n  Switched to '${name}'`);
    console.log(`  → ${parsed.CLAWDEX_MODEL || "unknown"} via ${parsed.CLAWDEX_PROVIDER || "unknown"}\n`);
  });

program
  .command("profiles")
  .description("List saved profiles")
  .action(() => {
    const profilesDir = getProfilesDir();
    if (!fs.existsSync(profilesDir)) {
      console.log("\n  No profiles saved yet. Run 'clawx init' or 'clawx add <name>'.\n");
      return;
    }

    const files = fs.readdirSync(profilesDir).filter((f) => !f.startsWith("."));
    if (files.length === 0) {
      console.log("\n  No profiles saved yet. Run 'clawx init' or 'clawx add <name>'.\n");
      return;
    }

    const active = getActiveProfileName();
    console.log("\n  Saved profiles:\n");
    for (const name of files) {
      const content = fs.readFileSync(path.join(profilesDir, name), "utf-8");
      const parsed = parseProfileConfig(content);
      const model = parsed.CLAWDEX_MODEL || "unknown";
      const provider = parsed.CLAWDEX_PROVIDER || "unknown";
      const marker = name === active ? " ← active" : "";
      console.log(`    ${name.padEnd(20)} ${model} via ${provider}${marker}`);
    }
    console.log(`\n  Switch with: clawx use <name>\n`);
  });

program
  .command("remove")
  .description("Delete a saved profile")
  .argument("<name>", "Profile name to remove")
  .action((name: string) => {
    const profilePath = path.join(getProfilesDir(), name);
    if (!fs.existsSync(profilePath)) {
      console.error(`\n  Profile '${name}' not found.\n`);
      process.exit(1);
    }
    fs.unlinkSync(profilePath);
    const active = getActiveProfileName();
    if (active === name) {
      fs.unlinkSync(path.join(getGlobalConfigDir(), "active-profile"));
    }
    console.log(`\n  Profile '${name}' removed.\n`);
  });

program.parse();
