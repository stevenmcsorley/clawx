/**
 * Configuration loading for Clawdex.
 *
 * Loads from environment variables (with .env support) and optional clawdex.json.
 * No complex config system — just env vars and a JSON file.
 */

import fs from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import type { ClawdexConfig, SshTarget } from "../types/index.js";

const DEFAULTS: ClawdexConfig = {
  provider: "openai-completions",
  baseUrl: "http://localhost:8080/v1",
  model: "qwen2.5-coder-14b-instruct",
  apiKey: "not-needed",
  workDir: process.cwd(),
  shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
  execTimeout: 120_000,
  thinkingLevel: "medium",
  maxTokens: 16384,
  sessionDir: path.join(
    process.env.HOME || process.env.USERPROFILE || ".",
    ".clawdex",
    "sessions",
  ),
  sshTargets: {},
};

function parseSshTargets(raw: string): Record<string, SshTarget> {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as Record<string, SshTarget>;
  } catch {
    return {};
  }
}

function loadJsonConfig(workDir: string): Partial<ClawdexConfig> {
  const configPath = path.join(workDir, "clawdex.json");
  if (!fs.existsSync(configPath)) return {};
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as Partial<ClawdexConfig>;
  } catch {
    return {};
  }
}

export function loadConfig(overrides?: Partial<ClawdexConfig>): ClawdexConfig {
  // Load .env — first try cwd, then the clawdex install directory
  loadDotenv();
  // If CLAWDEX_PROVIDER wasn't found in cwd's .env, try the package root
  if (!process.env.CLAWDEX_PROVIDER) {
    const packageRoot = path.resolve(
      new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
      "../../..",
    );
    loadDotenv({ path: path.join(packageRoot, ".env") });
  }

  const env = process.env;
  const workDir = env.CLAWDEX_WORK_DIR || overrides?.workDir || DEFAULTS.workDir;
  const jsonConfig = loadJsonConfig(workDir);

  const config: ClawdexConfig = {
    provider:
      overrides?.provider ||
      env.CLAWDEX_PROVIDER ||
      jsonConfig.provider ||
      DEFAULTS.provider,
    baseUrl:
      overrides?.baseUrl ||
      env.CLAWDEX_BASE_URL ||
      jsonConfig.baseUrl ||
      DEFAULTS.baseUrl,
    model:
      overrides?.model ||
      env.CLAWDEX_MODEL ||
      jsonConfig.model ||
      DEFAULTS.model,
    apiKey:
      overrides?.apiKey ||
      env.CLAWDEX_API_KEY ||
      env.OPENAI_API_KEY ||
      env.ANTHROPIC_API_KEY ||
      jsonConfig.apiKey ||
      DEFAULTS.apiKey,
    workDir,
    shell:
      overrides?.shell ||
      env.CLAWDEX_SHELL ||
      env.SHELL ||
      jsonConfig.shell ||
      DEFAULTS.shell,
    execTimeout:
      overrides?.execTimeout ||
      (env.CLAWDEX_EXEC_TIMEOUT ? parseInt(env.CLAWDEX_EXEC_TIMEOUT, 10) : 0) ||
      jsonConfig.execTimeout ||
      DEFAULTS.execTimeout,
    thinkingLevel:
      (overrides?.thinkingLevel ||
        env.CLAWDEX_THINKING_LEVEL ||
        jsonConfig.thinkingLevel ||
        DEFAULTS.thinkingLevel) as ClawdexConfig["thinkingLevel"],
    maxTokens:
      overrides?.maxTokens ||
      (env.CLAWDEX_MAX_TOKENS ? parseInt(env.CLAWDEX_MAX_TOKENS, 10) : 0) ||
      jsonConfig.maxTokens ||
      DEFAULTS.maxTokens,
    sessionDir:
      overrides?.sessionDir ||
      env.CLAWDEX_SESSION_DIR ||
      jsonConfig.sessionDir ||
      DEFAULTS.sessionDir,
    sshTargets:
      overrides?.sshTargets ||
      (env.CLAWDEX_SSH_TARGETS
        ? parseSshTargets(env.CLAWDEX_SSH_TARGETS)
        : jsonConfig.sshTargets || DEFAULTS.sshTargets),
    systemPrompt: overrides?.systemPrompt || jsonConfig.systemPrompt,
  };

  return config;
}
