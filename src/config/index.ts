/**
 * Configuration loading for Clawx.
 *
 * Loads from environment variables (with .env support) and optional clawx.json.
 * No complex config system — just env vars and a JSON file.
 */

import fs from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import type { ClawxConfig, SshTarget } from "../types/index.js";

const DEFAULTS: ClawxConfig = {
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
    ".clawx",
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

function loadJsonFile(filePath: string): Partial<ClawxConfig> {
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Partial<ClawxConfig>;
  } catch {
    return {};
  }
}

function loadJsonConfig(workDir: string): Partial<ClawxConfig> {
  // 1. Check current working directory first
  const local = loadJsonFile(path.join(workDir, "clawx.json"));
  // 2. Check global config directory (~/.clawx/clawx.json)
  const global = loadJsonFile(path.join(getGlobalConfigDir(), "clawx.json"));
  // Local overrides global, but merge sshTargets from both
  const mergedSshTargets = {
    ...(global.sshTargets || {}),
    ...(local.sshTargets || {}),
  };
  const merged = { ...global, ...local };
  if (Object.keys(mergedSshTargets).length > 0) {
    merged.sshTargets = mergedSshTargets;
  }
  return merged;
}

/** Global config directory: ~/.clawx/ */
export function getGlobalConfigDir(): string {
  return path.join(
    process.env.HOME || process.env.USERPROFILE || ".",
    ".clawx",
  );
}

/** Path to global config file: ~/.clawx/config */
export function getGlobalConfigPath(): string {
  return path.join(getGlobalConfigDir(), "config");
}

/** Default base URLs for known providers */
const PROVIDER_BASE_URLS: Record<string, string> = {
  ollama: "http://localhost:11434/v1",
  local: "http://localhost:8080/v1",
  deepseek: "https://api.deepseek.com/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
};

export function loadConfig(overrides?: Partial<ClawxConfig>): ClawxConfig {
  // Load config in priority order:
  // 1. cwd/.env (project-level)
  // 2. ~/.clawx/config (global — written by `clawx init`)
  // 3. package install directory .env (dev fallback)
  loadDotenv();
  if (!process.env.CLAWDEX_PROVIDER) {
    const globalConfig = getGlobalConfigPath();
    if (fs.existsSync(globalConfig)) {
      loadDotenv({ path: globalConfig });
    }
  }
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

  // When --provider is set via CLI but --base-url is not, derive the base URL
  // from the provider instead of falling through to env vars (which may be for
  // a different provider entirely, e.g. .env has deepseek but CLI says ollama)
  const resolvedProvider =
    overrides?.provider ||
    env.CLAWDEX_PROVIDER ||
    jsonConfig.provider ||
    DEFAULTS.provider;

  let resolvedBaseUrl: string;
  if (overrides?.baseUrl) {
    resolvedBaseUrl = overrides.baseUrl;
  } else if (overrides?.provider) {
    // CLI specified --provider but not --base-url: use provider default
    resolvedBaseUrl = PROVIDER_BASE_URLS[overrides.provider] || env.CLAWDEX_BASE_URL || DEFAULTS.baseUrl;
  } else {
    resolvedBaseUrl = env.CLAWDEX_BASE_URL || jsonConfig.baseUrl || DEFAULTS.baseUrl;
  }

  const config: ClawxConfig = {
    provider: resolvedProvider,
    baseUrl: resolvedBaseUrl,
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
        DEFAULTS.thinkingLevel) as ClawxConfig["thinkingLevel"],
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
