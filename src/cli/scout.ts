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
import { loadHardwareSpec, promptHardwareSpec, autoDetectAndSave, type HardwareSpec } from "../config/hardware.js";
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
  // Load or detect hardware spec
  let hardware: HardwareSpec | null = null;

  if (options.setupHardware) {
    // --setup-hardware: manual prompts with auto-detected defaults
    hardware = await promptHardwareSpec();
  } else {
    hardware = loadHardwareSpec();
    if (!hardware) {
      // First run: auto-detect and save (only prompts if detection fails)
      hardware = await autoDetectAndSave();
    }
  }

  const model = resolveModel(config);
  const customTools = buildScoutTools();

  printBanner(config.model, config.provider);
  console.error("  Mode: Scout (HuggingFace Model Researcher)\n");

  // Pre-flight: check if model supports structured tool calling via Ollama API.
  // If not, stay in agent mode — the text tool parser handles models that output
  // tool calls as text (e.g. <tool_call>{...}</tool_call>).
  const structuredToolsSupported = await checkOllamaToolSupport(config);
  if (!structuredToolsSupported) {
    log.info(`Model '${config.model}' does not support Ollama structured tools — using text tool parser`);
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
    startInChatMode: false,
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
  process.env.PI_SKIP_VERSION_CHECK = '1';
  process.env.PI_OFFLINE = '1';

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

  // Always use agent prompt — text tool parser handles models without structured tools
  session.agent.setSystemPrompt(agentSystemPrompt);

  // CRITICAL: Remove all non-Scout tools from the session
  // DefaultResourceLoader loads generic file system tools (read, write, edit, etc.)
  // but Scout should only have the 3 Scout-specific tools
  const allTools = session.getAllTools();
  const scoutToolNames = new Set(customTools.map(t => t.name));
  
  // Get non-Scout tools to remove
  const toolsToRemove = allTools.filter(tool => !scoutToolNames.has(tool.name));
  
  if (toolsToRemove.length > 0) {
    log.info(`Removing ${toolsToRemove.length} non-Scout tools: ${toolsToRemove.map(t => t.name).join(', ')}`);
    
    // Try to remove tools from the session
    // This is a hacky approach since pi-coding-agent might not expose a public API for this
    // We'll try to access internal properties
    const sessionAny = session as any;
    
    // Try different approaches to remove tools
    if (sessionAny.tools && Array.isArray(sessionAny.tools)) {
      // Direct tools array
      sessionAny.tools = sessionAny.tools.filter((t: any) => scoutToolNames.has(t.name));
    }
    
    if (sessionAny.agent && sessionAny.agent.tools && Array.isArray(sessionAny.agent.tools)) {
      // Agent tools array
      sessionAny.agent.tools = sessionAny.agent.tools.filter((t: any) => scoutToolNames.has(t.name));
    }
    
    if (sessionAny._extensions) {
      // Clear extensions that might provide tools
      sessionAny._extensions = sessionAny._extensions.filter((ext: any) => {
        // Keep only extensions without tools or with only Scout tools
        if (!ext.tools || !Array.isArray(ext.tools)) return true;
        const extToolNames = ext.tools.map((t: any) => t.name);
        return extToolNames.every((name: string) => scoutToolNames.has(name));
      });
    }
  }

  // Get final tool list after removal
  const finalTools = session.getAllTools();
  log.info(`Final Scout tools: ${finalTools.map((t) => t.name).join(", ")}`);

  // Inject text tool parser for Qwen-style models
  const finalToolNames = finalTools.map((t) => t.name);
  if (finalToolNames.length > 0) {
    session.agent.streamFn = createToolParsingStreamFn(finalToolNames) as typeof session.agent.streamFn;
  }

  // Build a welcome initial message so the agent introduces itself with hardware context
  const initialMessage =
    `My hardware: ${hardware.gpu}, ${hardware.vram} VRAM, ${hardware.ram} RAM, ${hardware.os}` +
    (hardware.notes ? `. ${hardware.notes}` : "") +
    `. What models would you recommend for local coding assistance with tool calling support?`;

  // Launch interactive mode
  const mode = new InteractiveMode(session, {
    modelFallbackMessage,
    initialMessage,
    verbose: options.verbose,
  });

  await mode.run();
}
