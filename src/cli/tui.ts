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
 * - /chat to toggle chat mode (no tools) for models that don't support them
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
  DefaultResourceLoader,
  SettingsManager,
  createCodingTools,
  createGrepTool,
  createFindTool,
  createLsTool,
  type ToolDefinition,
  type ExtensionFactory,
} from "@mariozechner/pi-coding-agent";
import type { Model, Api } from "@mariozechner/pi-ai";
import type { ClawxConfig, ToolPromptEntry } from "../types/index.js";
import { resolveModel } from "../core/provider.js";
import { createSshRunTool } from "../tools/sshRun.js";
import { createGitStatusTool } from "../tools/gitStatus.js";
import { createGitDiffTool } from "../tools/gitDiff.js";
import { createSearchFilesTool } from "../tools/searchFiles.js";
import { buildSystemPrompt, buildChatPrompt } from "../utils/system-prompt.js";
import { createChatModeExtension } from "../extensions/chat-mode.js";
import { createToolParsingStreamFn } from "../core/text-tool-parser.js";
import { loadExtensions, getDefaultExtensionsDir } from "../core/extension-loader.js";
import { log } from "../utils/logger.js";
import { printBanner } from "./banner.js";

/**
 * Build custom tool definitions for registration with AgentSession.
 *
 * pi-coding-agent's extension system uses ToolDefinition objects
 * that wrap AgentTool with additional metadata.
 */
function toolToDefinition(tool: { name: string; label: string; description: string; promptSnippet?: string; parameters: any; execute: any }): ToolDefinition {
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    promptSnippet: tool.promptSnippet || tool.description,
    parameters: tool.parameters,
    execute: tool.execute.bind(tool),
  } as unknown as ToolDefinition;
}

/**
 * Check if an object is already a ToolDefinition
 */
function isToolDefinition(obj: any): obj is ToolDefinition {
  return obj && 
    typeof obj.name === 'string' &&
    typeof obj.label === 'string' &&
    typeof obj.description === 'string' &&
    typeof obj.execute === 'function';
}

function buildToolPromptEntries(tools: ToolDefinition[]): ToolPromptEntry[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description || tool.label || tool.name,
    promptSnippet: (tool as any).promptSnippet || tool.description || tool.label || tool.name,
  }));
}

async function buildCustomTools(config: ClawxConfig): Promise<ToolDefinition[]> {
  const cwd = config.workDir;
  const tools: ToolDefinition[] = [];

  // Core Clawx tools
  tools.push(toolToDefinition(createSearchFilesTool(cwd)));
  tools.push(toolToDefinition(createGitStatusTool(cwd)));
  tools.push(toolToDefinition(createGitDiffTool(cwd)));

  // Explicit built-in coding tools that the model should be aware of up front
  tools.push(toolToDefinition(createFindTool(cwd) as any));
  tools.push(toolToDefinition(createLsTool(cwd) as any));
  tools.push(toolToDefinition(createGrepTool(cwd) as any));

  const codingTools = createCodingTools(cwd) as any[];
  for (const tool of codingTools) {
    if (!tools.some(existing => existing.name === tool.name)) {
      tools.push(toolToDefinition(tool as any));
    }
  }

  if (Object.keys(config.sshTargets).length > 0) {
    tools.push(toolToDefinition(createSshRunTool(config.sshTargets)));
  }

  // Agent and peer-federation tools
  // Includes local worker lifecycle plus explicit LAN peer-master federation
  try {
    const { agentServeTool } = await import('../tools/agentServe.js');
    const { agentListTool } = await import('../tools/agentList.js');
    const { agentSpawnLocalTool } = await import('../tools/agentSpawnLocal.js');
    const { agentSendTool } = await import('../tools/agentSend.js');
    const { agentStatusTool } = await import('../tools/agentStatus.js');
    const { agentResultTool } = await import('../tools/agentResult.js');
    const { agentCleanupTool } = await import('../tools/agentCleanup.js');
    const { agentRehydrateWorkersTool } = await import('../tools/agentRehydrateWorkers.js');
    const { agentMasterStatusTool } = await import('../tools/agentMasterStatus.js');
    const { agentCleanupPortTool } = await import('../tools/agentCleanupPort.js');
    const { agentCleanupProcessesTool } = await import('../tools/agentCleanupProcesses.js');
    const { agentPeerAddTool } = await import('../tools/agentPeerAdd.js');
    const { agentPeerChatTool } = await import('../tools/agentPeerChat.js');
    const { agentPeerSendTool } = await import('../tools/agentPeerSend.js');
    const { agentPeerListWorkersTool } = await import('../tools/agentPeerListWorkers.js');
    const { agentPeerPersonaShowTool } = await import('../tools/agentPeerPersonaShow.js');
    const { agentPeerPersonaSetTool } = await import('../tools/agentPeerPersonaSet.js');
    const { agentPeerMemoryShowTool } = await import('../tools/agentPeerMemoryShow.js');
    const { agentPeerMemoryUpdateTool } = await import('../tools/agentPeerMemoryUpdate.js');
    const { agentPeerServeTool } = await import('../tools/agentPeerServe.js');
    // Persona tools
    const { agentPersonaShowTool } = await import('../tools/agentPersonaShow.js');
    const { agentPersonaSetTool } = await import('../tools/agentPersonaSet.js');
    const { agentChatTool } = await import('../tools/agentChat.js');
    const { agentMemoryShowTool } = await import('../tools/agentMemoryShow.js');
    const { agentMemoryUpdateTool } = await import('../tools/agentMemoryUpdate.js');
    
    tools.push(toolToDefinition(agentServeTool));
    tools.push(toolToDefinition(agentListTool));
    tools.push(toolToDefinition(agentSpawnLocalTool));
    tools.push(toolToDefinition(agentSendTool));
    tools.push(toolToDefinition(agentStatusTool));
    tools.push(toolToDefinition(agentResultTool));
    tools.push(toolToDefinition(agentCleanupTool));
    tools.push(toolToDefinition(agentRehydrateWorkersTool));
    tools.push(toolToDefinition(agentMasterStatusTool));
    tools.push(toolToDefinition(agentCleanupPortTool));
    tools.push(toolToDefinition(agentCleanupProcessesTool));
    tools.push(toolToDefinition(agentPeerAddTool));
    tools.push(toolToDefinition(agentPeerChatTool));
    tools.push(toolToDefinition(agentPeerSendTool));
    tools.push(toolToDefinition(agentPeerListWorkersTool));
    tools.push(toolToDefinition(agentPeerPersonaShowTool));
    tools.push(toolToDefinition(agentPeerPersonaSetTool));
    tools.push(toolToDefinition(agentPeerMemoryShowTool));
    tools.push(toolToDefinition(agentPeerMemoryUpdateTool));
    tools.push(toolToDefinition(agentPeerServeTool));
    // Persona tools
    tools.push(toolToDefinition(agentPersonaShowTool));
    tools.push(toolToDefinition(agentPersonaSetTool));
    tools.push(toolToDefinition(agentChatTool));
    tools.push(toolToDefinition(agentMemoryShowTool));
    tools.push(toolToDefinition(agentMemoryUpdateTool));
  } catch (error) {
    log.debug('Agent tools not available:', error instanceof Error ? error.message : String(error));
    // Continue without agent tools - don't break Clawx
  }

  // Scout and Forge tools — available in main TUI
  try {
    const { createHfSearchTool } = await import('../tools/hfSearch.js');
    const { createHfModelInfoTool } = await import('../tools/hfModelInfo.js');
    const { createHfReadmeTool } = await import('../tools/hfReadme.js');
    const { createHfDatasetSearchTool } = await import('../tools/hfDatasetSearch.js');
    const { createForgeWriteCapabilityTool } = await import('../tools/forgeWriteCapability.js');
    const { createForgeListCapabilitiesTool } = await import('../tools/forgeListCapabilities.js');
    
    tools.push(toolToDefinition(createHfSearchTool()));
    tools.push(toolToDefinition(createHfModelInfoTool()));
    tools.push(toolToDefinition(createHfReadmeTool()));
    tools.push(toolToDefinition(createHfDatasetSearchTool()));
    tools.push(toolToDefinition(createForgeWriteCapabilityTool()));
    tools.push(toolToDefinition(createForgeListCapabilitiesTool()));
  } catch (error) {
    log.debug('Scout/Forge tools not available:', error instanceof Error ? error.message : String(error));
    // Continue without them
  }

  // Load extensions
  const extensionsDir = config.extensionsDir || getDefaultExtensionsDir();
  try {
    const extensionTools = await loadExtensions(extensionsDir);
    tools.push(...extensionTools);
  } catch (error) {
    log.warn(`Failed to load extensions: ${error instanceof Error ? error.message : String(error)}`);
    // Continue without extensions - don't break Clawx
  }

  return tools;
}

/**
 * Check if an Ollama model supports tool calling.
 * Returns true if tools are supported, false if not.
 */
async function checkOllamaToolSupport(config: ClawxConfig): Promise<boolean> {
  if (config.provider !== "ollama" && config.provider !== "local") return true;
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
        return false;
      }
    }
    return true;
  } catch {
    return true; // Can't reach Ollama — let TUI handle the connection error
  }
}

/**
 * Start the TUI mode.
 *
 * Creates an AgentSession via the pi-coding-agent SDK with our
 * custom model and tools, then runs InteractiveMode for the full
 * terminal UI experience.
 *
 * If the model doesn't support tools, automatically starts in chat mode.
 * Users can toggle with /chat at any time.
 */
export async function startTui(
  baseConfig: ClawxConfig,
  options: {
    initialMessage?: string;
    continueSession?: boolean;
    verbose?: boolean;
    sshEnabled?: boolean;
  } = {},
): Promise<void> {
  const customTools = await buildCustomTools(baseConfig);
  const config: ClawxConfig = {
    ...baseConfig,
    toolPromptEntries: buildToolPromptEntries(customTools),
  };
  const model = resolveModel(config);

  printBanner(config.model, config.provider);

  // Pre-flight: check if model supports structured tool calling via Ollama API.
  // If not, we stay in agent mode anyway — the text tool parser will handle
  // models that output tool calls as text (e.g. <tool_call>{...}</tool_call>).
  const structuredToolsSupported = await checkOllamaToolSupport(config);
  if (!structuredToolsSupported) {
    log.info(`Model '${config.model}' does not support Ollama structured tools — using text tool parser`);
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

  // Build system prompts
  const agentSystemPrompt = buildSystemPrompt(config);
  const chatSystemPrompt = buildChatPrompt(config);

  // Include Scout/Forge tool descriptions in system prompt
  const scoutForgeToolNamesList = customTools
    .filter(t => t.name.startsWith('hf_') || t.name.startsWith('forge_'))
    .map(t => t.name);
  if (scoutForgeToolNamesList.length > 0) {
    log.info(`Scout/Forge tools available in main TUI: ${scoutForgeToolNamesList.join(', ')}`);
  }

  // Create chat mode extension
  const chatModeFactory: ExtensionFactory = createChatModeExtension({
    agentSystemPrompt,
    chatSystemPrompt,
    startInChatMode: false,
    sshEnabled: options.sshEnabled,
  });

  // Create resource loader with our chat mode extension
  const resourceLoader = new DefaultResourceLoader({
    cwd: config.workDir,
    extensionFactories: [chatModeFactory],
    extensionsOverride: (base) => {
      // Rename inline extensions to show "clawx" instead of "<inline:1>"
      for (const ext of base.extensions) {
        if (ext.path.startsWith("<inline:")) {
          ext.path = "clawx";
          ext.resolvedPath = "clawx";
        }
      }
      return base;
    },
  });
  await resourceLoader.reload();

  // Quiet startup — hide the extensions/keybindings banner
  // Also suppress upstream pi-coding-agent version/package update notices,
  // which are misleading in Clawx because they point at the upstream package
  // instead of Clawx releases.
  const settingsManager = SettingsManager.create(config.workDir);
  settingsManager.setQuietStartup(true);
  process.env.PI_SKIP_VERSION_CHECK = '1';
  process.env.PI_OFFLINE = '1';

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
      resourceLoader,
      settingsManager,
    });

  // Always use agent prompt — text tool parser handles models without structured tools
  session.agent.setSystemPrompt(agentSystemPrompt);

  // Inject text-based tool call parser for models that output tool calls as plain text
  // (e.g. Qwen2.5-Coder). This wraps the default streamFn to detect and convert
  // JSON tool calls in text responses into structured ToolCall objects.
  const allToolNames = session.getAllTools().map((t) => t.name);
  if (allToolNames.length > 0) {
    session.agent.streamFn = createToolParsingStreamFn(allToolNames) as typeof session.agent.streamFn;
  }

  // Create and run the interactive mode
  const mode = new InteractiveMode(session, {
    modelFallbackMessage,
    initialMessage: options.initialMessage,
    verbose: options.verbose,
  });

  await mode.run();
}
