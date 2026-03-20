/**
 * Clawx type definitions.
 *
 * Core message/tool/model types come from @mariozechner/pi-ai and pi-agent-core.
 * This file defines Clawx-specific configuration and runtime types.
 */

export interface ToolPromptEntry {
  name: string;
  description: string;
  promptSnippet?: string;
}

export interface ClawxConfig {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  workDir: string;
  shell: string;
  execTimeout: number;
  thinkingLevel: "off" | "minimal" | "low" | "medium" | "high";
  maxTokens: number;
  sessionDir: string;
  sshTargets: Record<string, SshTarget>;
  systemPrompt?: string;
  huggingfaceToken?: string;
  extensionsDir?: string;
  toolPromptEntries?: ToolPromptEntry[];
}

export interface SshTarget {
  host: string;
  port?: number;
  username: string;
  privateKeyPath?: string;
  password?: string;
}

export interface ClawxSession {
  id: string;
  startedAt: number;
  workDir: string;
  model: string;
  provider: string;
}
