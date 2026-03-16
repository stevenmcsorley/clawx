/**
 * Clawx Agent — the core orchestrator.
 *
 * EXTRACTION NOTE:
 * OpenClaw's agent orchestration lives in pi-embedded-runner/run.ts (3000+ lines)
 * which handles auth rotation, sandbox environments, context engines, plugin hooks,
 * provider-specific quirks, compaction, failover, and channel integration.
 *
 * We DISCARD all of that and use the clean pi-agent-core agentLoop() directly.
 * The agentLoop (agent-loop.js, 308 lines) handles:
 *   user message → model call → tool calls → tool execution → next model call → end
 *
 * Our orchestrator is a thin wrapper that:
 * 1. Resolves the model from config
 * 2. Assembles tools (pi-coding-agent builtins + our custom tools)
 * 3. Builds the agent context (system prompt, messages, tools)
 * 4. Calls agentLoop() and streams events to the terminal
 * 5. Persists session state
 *
 * This replaces ~4000 lines of OpenClaw platform code with ~200 lines.
 */

import {
  agentLoop,
  type AgentContext,
  type AgentLoopConfig,
  type AgentMessage,
  type AgentEvent,
  type AgentTool,
} from "@mariozechner/pi-agent-core";
import { type Model, type Message } from "@mariozechner/pi-ai";
import {
  createCodingTools,
  createGrepTool,
  createFindTool,
  createLsTool,
  convertToLlm,
} from "@mariozechner/pi-coding-agent";
import type { ClawxConfig } from "../types/index.js";
import { resolveModel } from "./provider.js";
import { buildSystemPrompt } from "../utils/system-prompt.js";
import { createSshRunTool } from "../tools/sshRun.js";
import { createGitStatusTool } from "../tools/gitStatus.js";
import { createGitDiffTool } from "../tools/gitDiff.js";
import { createSearchFilesTool } from "../tools/searchFiles.js";
import { log } from "../utils/logger.js";

export interface AgentRunOptions {
  /** User's message/prompt */
  prompt: string;
  /** Existing conversation messages (for multi-turn) */
  messages?: AgentMessage[];
  /** Callback for streaming events */
  onEvent?: (event: AgentEvent) => void;
  /** Abort signal */
  signal?: AbortSignal;
  /** Queued user messages to inject mid-run */
  steeringQueue?: AgentMessage[];
}

export interface AgentRunResult {
  messages: AgentMessage[];
  aborted: boolean;
}

/**
 * Create the full tool set for Clawx.
 *
 * EXTRACTION NOTE:
 * OpenClaw's createOpenClawCodingTools() (pi-tools.ts, 619 lines) handles:
 * - 6 layers of tool policies (global, agent, group, profile, provider, subagent)
 * - Sandbox vs gateway vs node execution routing
 * - Memory flush restrictions
 * - Channel capabilities filtering
 * - Tool schema sanitization per provider
 * - Image sanitization limits
 * - Abort signal wrapping
 * - Loop detection wrapping
 *
 * We discard ALL of that. Our tools are the pi-coding-agent defaults plus
 * our custom SSH/git/search tools. No policies, no sandboxing, no restrictions.
 */
function createTools(config: ClawxConfig): AgentTool<any>[] {
  const cwd = config.workDir;

  // pi-coding-agent's built-in coding tools: read, write, edit, bash (exec)
  // These are KEPT AS-IS from the OpenClaw dependency chain.
  const builtinTools: AgentTool<any>[] = createCodingTools(cwd);

  // Add grep, find, ls from pi-coding-agent
  builtinTools.push(createGrepTool(cwd));
  builtinTools.push(createFindTool(cwd));
  builtinTools.push(createLsTool(cwd));

  // Our custom tools (WRITTEN FRESH — not in OpenClaw)
  const customTools: AgentTool<any>[] = [
    createSearchFilesTool(cwd),
    createGitStatusTool(cwd),
    createGitDiffTool(cwd),
  ];

  // SSH tool — only if targets are configured
  if (Object.keys(config.sshTargets).length > 0) {
    customTools.push(createSshRunTool(config.sshTargets));
  }

  return [...builtinTools, ...customTools];
}

/**
 * Run the Clawx agent loop.
 *
 * This is the main entry point. It:
 * 1. Resolves the model
 * 2. Builds tools
 * 3. Creates the agent context
 * 4. Runs agentLoop() from pi-agent-core
 * 5. Streams events via callback
 * 6. Returns the full message history
 */
export async function runAgent(
  config: ClawxConfig,
  options: AgentRunOptions,
): Promise<AgentRunResult> {
  const model = resolveModel(config);
  const tools = createTools(config);
  const systemPrompt = buildSystemPrompt(config);

  log.info(`Tools: ${tools.map((t) => t.name).join(", ")}`);

  // Build context with existing messages or empty
  const existingMessages: AgentMessage[] = options.messages || [];
  const context: AgentContext = {
    systemPrompt,
    messages: existingMessages,
    tools,
  };

  // Build the user message
  const userMessage: AgentMessage = {
    role: "user" as const,
    content: options.prompt,
    timestamp: Date.now(),
  };

  // Agent loop config
  const loopConfig: AgentLoopConfig = {
    model: model as Model<any>,
    apiKey: config.apiKey,
    maxTokens: config.maxTokens,
    reasoning: config.thinkingLevel === "off" ? undefined : config.thinkingLevel,
    convertToLlm: async (messages: AgentMessage[]): Promise<Message[]> => {
      // Use pi-coding-agent's convertToLlm which handles the standard message types
      try {
        return convertToLlm(messages);
      } catch {
        // Fallback: filter to standard LLM messages
        return messages.filter(
          (m): m is Message =>
            m.role === "user" || m.role === "assistant" || m.role === "toolResult",
        );
      }
    },
    getSteeringMessages: async (): Promise<AgentMessage[]> => {
      // Support mid-run message injection (e.g., user typing while agent works)
      if (options.steeringQueue && options.steeringQueue.length > 0) {
        const queued = [...options.steeringQueue];
        options.steeringQueue.length = 0;
        return queued;
      }
      return [];
    },
  };

  // Run the loop
  const eventStream = agentLoop(
    [userMessage],
    context,
    loopConfig,
    options.signal,
  );

  let aborted = false;

  // Process events
  for await (const event of eventStream) {
    if (options.onEvent) {
      options.onEvent(event);
    }

    if (
      event.type === "agent_end" ||
      (event.type === "turn_end" &&
        event.message.role === "assistant" &&
        "stopReason" in event.message &&
        (event.message.stopReason === "error" || event.message.stopReason === "aborted"))
    ) {
      if (
        "message" in event &&
        event.message.role === "assistant" &&
        "stopReason" in event.message &&
        event.message.stopReason === "aborted"
      ) {
        aborted = true;
      }
    }
  }

  // Get the final messages from the event stream result
  const result = await eventStream.result();

  return {
    messages: [...existingMessages, ...result],
    aborted,
  };
}

export { type AgentEvent, type AgentMessage };
