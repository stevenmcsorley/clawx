/**
 * Clawx — lean coding/execution agent.
 *
 * Public API for programmatic usage.
 */

export { loadConfig } from "./config/index.js";
export { runAgent, ToolsNotSupportedError, type AgentRunOptions, type AgentRunResult } from "./core/agent.js";
export { resolveModel } from "./core/provider.js";
export {
  createSessionId,
  saveSession,
  loadSession,
  listSessions,
  getLatestSession,
} from "./core/session.js";
export { createStreamRenderer } from "./core/streaming.js";
export { buildSystemPrompt } from "./utils/system-prompt.js";
export { log } from "./utils/logger.js";

// Tool factories for custom compositions
export { createSshRunTool } from "./tools/sshRun.js";
export { createGitStatusTool } from "./tools/gitStatus.js";
export { createGitDiffTool } from "./tools/gitDiff.js";
export { createSearchFilesTool } from "./tools/searchFiles.js";

// Re-export types
export type { ClawxConfig, SshTarget, ClawxSession } from "./types/index.js";
