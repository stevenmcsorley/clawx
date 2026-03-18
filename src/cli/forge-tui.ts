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
import type { ClawxConfig } from "../types/index.js";
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
function toolToDefinition(tool: { name: string; label: string; description: string; parameters: any; execute: any }): ToolDefinition {
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
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

export async function startForgeTUI(
  config: ClawxConfig,
): Promise<void> {
  const model = resolveModel(config);
  const customTools = buildForgeTools();

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
      for (const ext of base.extensions) {
        // Check if this is the chat-mode extension
        const extAny = ext as any;
        if (extAny.agentSystemPrompt !== undefined) {
          // This is likely the chat-mode extension
          extAny.agentSystemPrompt = agentSystemPrompt;
          extAny.chatSystemPrompt = chatSystemPrompt;
        }
      }
      return base;
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

  // Inject text tool parser for Qwen-style models
  const allToolNames = session.getAllTools().map((t) => t.name);
  if (allToolNames.length > 0) {
    session.agent.streamFn = createToolParsingStreamFn(allToolNames) as typeof session.agent.streamFn;
  }

  // Build a direct initial message
  const initialMessage = `Forge: Builder for Clawx extensions.

State your specific build goal, or ask "what can I build?"`;

  // Launch interactive mode
  const mode = new InteractiveMode(session, {
    modelFallbackMessage,
    initialMessage,
  });

  await mode.run();
}