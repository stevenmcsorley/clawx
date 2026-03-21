/**
 * Forge command — AI-powered capability builder for Clawx.
 *
 * Launches an interactive TUI session for discovering and building
 * new tools on top of Clawx.
 */

import {
  createAgentSession,
  InteractiveMode,
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  SettingsManager,
  type ToolDefinition,
  type ExtensionFactory,
} from "@mariozechner/pi-coding-agent";
import type { Model, Api } from "@mariozechner/pi-ai";
import type { ClawxConfig, ToolPromptEntry } from "../types/index.js";
import { resolveModel } from "../core/provider.js";
import { createHfSearchTool } from "../tools/hfSearch.js";
import { createHfModelInfoTool } from "../tools/hfModelInfo.js";
import { createHfReadmeTool } from "../tools/hfReadme.js";
import { buildForgePrompt } from "../utils/forge-prompt.js";
import { createChatModeExtension } from "../extensions/chat-mode.js";
import { createToolParsingStreamFn } from "../core/text-tool-parser.js";
import { log } from "../utils/logger.js";
import { printBanner } from "./banner.js";

// Import new Forge tools
import { createHfDatasetSearchTool } from "../tools/hfDatasetSearch.js";
import { createForgeWriteCapabilityTool } from "../tools/forgeWriteCapability.js";
import { createForgeListCapabilitiesTool } from "../tools/forgeListCapabilities.js";

/**
 * Convert a tool object to a ToolDefinition for pi-coding-agent.
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

function buildForgeTools(): ToolDefinition[] {
  return [
    toolToDefinition(createHfSearchTool()),
    toolToDefinition(createHfModelInfoTool()),
    toolToDefinition(createHfReadmeTool()),
    toolToDefinition(createHfDatasetSearchTool()),
    toolToDefinition(createForgeWriteCapabilityTool()),
    toolToDefinition(createForgeListCapabilitiesTool()),
  ];
}

function buildToolPromptEntries(tools: ToolDefinition[]): ToolPromptEntry[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description || tool.label || tool.name,
    promptSnippet: (tool as any).promptSnippet || tool.description || tool.label || tool.name,
  }));
}

export async function startForgeTUI(
  baseConfig: ClawxConfig,
): Promise<void> {
  const customTools = buildForgeTools();
  const config: ClawxConfig = {
    ...baseConfig,
    toolPromptEntries: buildToolPromptEntries(customTools),
  };
  const model = resolveModel(config);

  printBanner(config.model, config.provider);
  console.error("  Mode: Forge (Capability Builder)\n");

  log.info(`Starting Forge with ${model.id} @ ${model.provider}`);
  log.info(`Forge tools: ${customTools.map((t) => t.name).join(", ")}`);

  // Auth setup
  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey(config.provider, config.apiKey);

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

  // Build forge-specific system prompts
  const agentSystemPrompt = buildForgePrompt();
  const chatSystemPrompt = `You are Forge, a builder for Clawx extensions.

You are in chat mode — you cannot search HuggingFace or create extensions right now.
Keep discussions focused on tool implementation and technical details.
If the user needs to build something, suggest they switch back with /chat.`;

  // Chat mode extension
  const chatModeFactory: ExtensionFactory = createChatModeExtension({
    agentSystemPrompt,
    chatSystemPrompt,
    startInChatMode: false,
  });

  const resourceLoader = new DefaultResourceLoader({
    cwd: config.workDir,
    extensionFactories: [chatModeFactory],
    extensionsOverride: (base) => {
      // Override extensions to ONLY include chat mode
      // This prevents loading of default file system tools
      return {
        ...base,
        extensions: base.extensions.filter((ext: any) => {
          // Only keep extensions that look like our chat mode extension
          // or have no tools
          const hasTools = ext.tools && Array.isArray(ext.tools) && ext.tools.length > 0;
          const isChatMode = ext.agentSystemPrompt !== undefined;
          return isChatMode || !hasTools;
        }),
      };
    },
  });

  const settingsManager = SettingsManager.create(config.workDir);
  settingsManager.setQuietStartup(true);

  // Create session
  const { session, extensionsResult, modelFallbackMessage } =
    await createAgentSession({
      cwd: config.workDir,
      model: model as Model<any>,
      thinkingLevel: config.thinkingLevel === "off" ? undefined : config.thinkingLevel,
      customTools,
      authStorage,
      modelRegistry,
      resourceLoader,
      settingsManager,
    });

  // Always use agent prompt
  session.agent.setSystemPrompt(agentSystemPrompt);

  // CRITICAL: Remove all non-Forge tools from the session
  // DefaultResourceLoader loads generic file system tools (read, write, edit, etc.)
  // but Forge should only have the 6 Forge-specific tools
  const allTools = session.getAllTools();
  const forgeToolNames = new Set(customTools.map(t => t.name));
  
  // Get non-Forge tools to remove
  const toolsToRemove = allTools.filter(tool => !forgeToolNames.has(tool.name));
  
  if (toolsToRemove.length > 0) {
    log.info(`Removing ${toolsToRemove.length} non-Forge tools: ${toolsToRemove.map(t => t.name).join(', ')}`);
    
    // Try to remove tools from the session
    // This is a hacky approach since pi-coding-agent might not expose a public API for this
    // We'll try to access internal properties
    const sessionAny = session as any;
    
    // Try different approaches to remove tools
    if (sessionAny.tools && Array.isArray(sessionAny.tools)) {
      // Direct tools array
      sessionAny.tools = sessionAny.tools.filter((t: any) => forgeToolNames.has(t.name));
    }
    
    if (sessionAny.agent && sessionAny.agent.tools && Array.isArray(sessionAny.agent.tools)) {
      // Agent tools array
      sessionAny.agent.tools = sessionAny.agent.tools.filter((t: any) => forgeToolNames.has(t.name));
    }
    
    if (sessionAny._extensions) {
      // Clear extensions that might provide tools
      sessionAny._extensions = sessionAny._extensions.filter((ext: any) => {
        // Keep only extensions without tools or with only Forge tools
        if (!ext.tools || !Array.isArray(ext.tools)) return true;
        const extToolNames = ext.tools.map((t: any) => t.name);
        return extToolNames.every((name: string) => forgeToolNames.has(name));
      });
    }
  }

  // Get final tool list after removal
  const finalTools = session.getAllTools();
  log.info(`Final Forge tools: ${finalTools.map((t) => t.name).join(", ")}`);

  // Inject text tool parser for Qwen-style models
  const finalToolNames = finalTools.map((t) => t.name);
  if (finalToolNames.length > 0) {
    session.agent.streamFn = createToolParsingStreamFn(finalToolNames) as typeof session.agent.streamFn;
  }

  // Build a direct initial message
  const initialMessage = `Forge: Builder for Clawx extensions.

State your specific build goal, or ask "what can I build?"

Current Forge toolset includes:
- hf_search
- hf_model_info
- hf_readme
- hf_dataset_search
- forge_write_capability
- forge_list_capabilities`;

  // Launch interactive mode
  const mode = new InteractiveMode(session, {
    modelFallbackMessage,
    initialMessage,
  });

  await mode.run();
}