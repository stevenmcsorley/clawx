/**
 * TUI mode for Clawx — uses pi-coding-agent's InteractiveMode.
 *
 * This provides the same rich terminal experience as OpenClaw/pi-coding-agent:
 * - Syntax-highlighted code in tool results
 * - Diff rendering for edit operations
 * - Spinner animations during tool execution
 * - Ctrl+P to cycle models
 * - Ctrl+C to cancel, Ctrl+D to quit
 * - Session branching and tree navigation
 * - Markdown rendering in responses
 * - /slash commands for settings, models, sessions, etc.
 *
 * EXTRACTION NOTE:
 * This is the pi-coding-agent InteractiveMode used AS-IS.
 * We create an AgentSession via the SDK, inject our custom tools
 * (SSH, git, search), and let InteractiveMode handle all UI.
 *
 * OpenClaw wraps this same InteractiveMode with 3000+ lines of
 * additional platform integration. We skip all of that.
 */

import {
  createAgentSession,
  InteractiveMode,
  AuthStorage,
  ModelRegistry,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import type { Model, Api } from "@mariozechner/pi-ai";
import type { ClawxConfig } from "../types/index.js";
import { resolveModel } from "../core/provider.js";
import { createSshRunTool } from "../tools/sshRun.js";
import { createGitStatusTool } from "../tools/gitStatus.js";
import { createGitDiffTool } from "../tools/gitDiff.js";
import { createSearchFilesTool } from "../tools/searchFiles.js";
import { buildSystemPrompt } from "../utils/system-prompt.js";
import { log } from "../utils/logger.js";
import { printBanner } from "./banner.js";

/**
 * Build custom tool definitions for registration with AgentSession.
 *
 * pi-coding-agent's extension system uses ToolDefinition objects
 * that wrap AgentTool with additional metadata.
 */
function toolToDefinition(tool: { name: string; label: string; description: string; parameters: any; execute: any }): ToolDefinition {
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: tool.parameters,
    execute: tool.execute.bind(tool),
  } as unknown as ToolDefinition;
}

function buildCustomTools(config: ClawxConfig): ToolDefinition[] {
  const cwd = config.workDir;
  const tools: ToolDefinition[] = [];

  tools.push(toolToDefinition(createSearchFilesTool(cwd)));
  tools.push(toolToDefinition(createGitStatusTool(cwd)));
  tools.push(toolToDefinition(createGitDiffTool(cwd)));

  if (Object.keys(config.sshTargets).length > 0) {
    tools.push(toolToDefinition(createSshRunTool(config.sshTargets)));
  }

  return tools;
}

/**
 * Start the TUI mode.
 *
 * Creates an AgentSession via the pi-coding-agent SDK with our
 * custom model and tools, then runs InteractiveMode for the full
 * terminal UI experience.
 */
export async function startTui(
  config: ClawxConfig,
  options: {
    initialMessage?: string;
    continueSession?: boolean;
    verbose?: boolean;
  } = {},
): Promise<void> {
  const model = resolveModel(config);
  const customTools = buildCustomTools(config);

  printBanner(config.model, config.provider);

  // Pre-flight: check if Ollama model supports tools before launching TUI
  if (config.provider === "ollama" || config.provider === "local") {
    try {
      const ollamaBase = config.baseUrl.replace(/\/v1\/?$/, "");
      const res = await fetch(`${ollamaBase}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: "user", content: "test" }],
          tools: [{ type: "function", function: { name: "test", description: "test", parameters: { type: "object", properties: {} } } }],
          stream: false,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        if (text.includes("does not support tools") || text.includes("does not support tool")) {
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
      }
    } catch {
      // Can't reach Ollama — let TUI handle the connection error
    }
  }

  log.info(`Starting TUI with ${model.id} @ ${model.provider}`);
  log.info(`Custom tools: ${customTools.map((t) => t.name).join(", ")}`);

  // Create AuthStorage and inject our API key so pi-coding-agent
  // doesn't reject local endpoints that have no env-var mapping
  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey(config.provider, config.apiKey);

  // Create ModelRegistry and register our configured provider so /models works
  const modelRegistry = new ModelRegistry(authStorage);
  modelRegistry.registerProvider(config.provider, {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    api: (model as Model<any>).api,
    models: [
      {
        id: (model as Model<any>).id,
        name: (model as Model<any>).name ?? (model as Model<any>).id,
        reasoning: (model as Model<any>).reasoning ?? false,
        input: (model as Model<any>).input ?? ["text"],
        cost: (model as Model<any>).cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: (model as Model<any>).contextWindow ?? 32768,
        maxTokens: (model as Model<any>).maxTokens ?? config.maxTokens,
      },
    ],
  });

  // Create session via the SDK
  const { session, extensionsResult, modelFallbackMessage } =
    await createAgentSession({
      cwd: config.workDir,
      model: model as Model<any>,
      thinkingLevel:
        config.thinkingLevel === "off" ? undefined : config.thinkingLevel,
      customTools,
      authStorage,
      modelRegistry,
    });

  // Override system prompt with our Clawx-specific one
  // AgentSession exposes the underlying Agent which has setSystemPrompt()
  const systemPrompt = buildSystemPrompt(config);
  session.agent.setSystemPrompt(systemPrompt);

  // Create and run the interactive mode
  const mode = new InteractiveMode(session, {
    modelFallbackMessage,
    initialMessage: options.initialMessage,
    verbose: options.verbose,
  });

  await mode.run();
}
