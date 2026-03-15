/**
 * Clawdex type definitions.
 *
 * Core message/tool/model types come from @mariozechner/pi-ai and pi-agent-core.
 * This file defines Clawdex-specific configuration and runtime types.
 */

export interface ClawdexConfig {
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
}

export interface SshTarget {
  host: string;
  port?: number;
  username: string;
  privateKeyPath?: string;
  password?: string;
}

export interface ClawdexSession {
  id: string;
  startedAt: number;
  workDir: string;
  model: string;
  provider: string;
}
