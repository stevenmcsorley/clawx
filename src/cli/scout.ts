/**
 * Scout command — AI-powered HuggingFace model researcher.
 *
 * Launches an interactive TUI session with HuggingFace tools
 * and an expert system prompt for model discovery.
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
import { loadHardwareSpec, promptHardwareSpec, type HardwareSpec } from "../config/hardware.js";
import { createHfSearchTool } from "../tools/hfSearch.js";
import { createHfModelInfoTool } from "../tools/hfModelInfo.js";
import { createHfReadmeTool } from "../tools/hfReadme.js";
import { buildScoutPrompt, buildScoutChatPrompt } from "../utils/scout-prompt.js";
import { createChatModeExtension } from "../extensions/chat-mode.js";
import { createToolParsingStreamFn } from "../core/text-tool-parser.js";
import { log } from "../utils/logger.js";
import { printBanner } from "./banner.js";

/**
 * Convert a tool object to a ToolDefinition for pi-coding-agent.
 * Same pattern as tui.ts.
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

function buildScoutTools(): ToolDefinition[] {
  return [
    toolToDefinition(createHfSearchTool()),
    toolToDefinition(createHfModelInfoTool()),
    toolToDefinition(createHfReadmeTool()),
  ];
}

/**
 * Check if an Ollama model supports tool calling.
 * Duplicated from tui.ts — same pre-flight check.
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
    return true;
  }
}

export async function startScout(
  config: ClawxConfig,
  options: {
    setupHardware?: boolean;
    verbose?: boolean;
  } = {},
): Promise<void> {
  // Load or prompt for hardware spec
  let hardware: HardwareSpec | null = null;

  if (options.setupHardware) {
    hardware = await promptHardwareSpec();
  } else {
    hardware = loadHardwareSpec();
    if (!hardware) {
      console.log("  No hardware spec found. Let's set up your system info for Scout.\n");
      hardware = await promptHardwareSpec();
    }
  }

  const model = resolveModel(config);
  const customTools = buildScoutTools();

  printBanner(config.model, config.provider);
  console.error("  Mode: Scout (HuggingFace Model Researcher)\n");

  // Pre-flight: check tool support
  const toolsSupported = await checkOllamaToolSupport(config);
  if (!toolsSupported) {
    log.info(`Model '${config.model}' does not support tools — starting in chat mode`);
  }

  log.info(`Starting Scout with ${model.id} @ ${model.provider}`);
  log.info(`Scout tools: ${customTools.map((t) => t.name).join(", ")}`);
  log.info(`Hardware: ${hardware.gpu}, ${hardware.vram} VRAM, ${hardware.ram} RAM`);

  // Auth setup — same as tui.ts
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

  // Build scout-specific system prompts
  const agentSystemPrompt = buildScoutPrompt(hardware);
  const chatSystemPrompt = buildScoutChatPrompt(hardware);

  // Chat mode extension
  const chatModeFactory: ExtensionFactory = createChatModeExtension({
    agentSystemPrompt,
    chatSystemPrompt,
    startInChatMode: !toolsSupported,
  });

  const resourceLoader = new DefaultResourceLoader({
    cwd: config.workDir,
    extensionFactories: [chatModeFactory],
    extensionsOverride: (base) => {
      for (const ext of base.extensions) {
        if (ext.path.startsWith("<inline:")) {
          ext.path = "scout";
          ext.resolvedPath = "scout";
        }
      }
      return base;
    },
  });
  await resourceLoader.reload();

  const settingsManager = SettingsManager.create(config.workDir);
  settingsManager.setQuietStartup(true);

  // Create session
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

  // Set scout system prompt
  session.agent.setSystemPrompt(toolsSupported ? agentSystemPrompt : chatSystemPrompt);

  // Inject text tool parser for Qwen-style models
  const allToolNames = session.getAllTools().map((t) => t.name);
  if (allToolNames.length > 0) {
    session.agent.streamFn = createToolParsingStreamFn(allToolNames) as typeof session.agent.streamFn;
  }

  // Launch interactive mode
  const mode = new InteractiveMode(session, {
    modelFallbackMessage,
    verbose: options.verbose,
  });

  await mode.run();
}
