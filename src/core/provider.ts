/**
 * Model/provider resolution for Clawx.
 *
 * EXTRACTION NOTE:
 * OpenClaw's model resolution (pi-embedded-runner/model.ts, 398 lines) handles
 * 15+ providers with config overrides, forward-compat fallbacks, OpenRouter pre-fetch,
 * and auth profile rotation. We discard all of that.
 *
 * Instead we use pi-ai's model system directly:
 * - For known providers (openai, anthropic, google): use getModel()
 * - For local/custom endpoints (llama.cpp, ollama, vllm): construct Model manually
 *   with api:"openai-completions" and a custom baseUrl
 *
 * This covers all target models:
 * - Qwen2.5-Coder-14B-Instruct-abliterated (local llama.cpp)
 * - Qwen3.5-35B-A3B (local)
 * - GLM-4.7-Flash-Uncensored (local)
 * - Any OpenAI-compatible endpoint
 */

import type { Api, Model } from "@mariozechner/pi-ai";
import type { ClawxConfig } from "../types/index.js";
import { log } from "../utils/logger.js";

/**
 * Known provider mappings to pi-ai API types.
 */
const PROVIDER_API_MAP: Record<string, Api> = {
  openai: "openai-completions",
  "openai-completions": "openai-completions",
  "openai-responses": "openai-responses",
  anthropic: "anthropic-messages",
  "anthropic-messages": "anthropic-messages",
  google: "google-generative-ai",
  "google-generative-ai": "google-generative-ai",
  mistral: "mistral-conversations",
  deepseek: "openai-completions",
  local: "openai-completions",
  "llama.cpp": "openai-completions",
  ollama: "openai-completions",
  vllm: "openai-completions",
  lmstudio: "openai-completions",
};

/**
 * Resolve a Model object from Clawx configuration.
 *
 * For local endpoints, we construct a Model with api:"openai-completions"
 * pointed at the custom baseUrl. This is exactly how OpenClaw handles
 * Ollama and local models — via the OpenAI-compatible completions API.
 */
export function resolveModel(config: ClawxConfig): Model<Api> {
  const api = PROVIDER_API_MAP[config.provider] || "openai-completions";

  log.info(`Provider: ${config.provider} (api: ${api})`);
  log.info(`Model: ${config.model}`);
  log.info(`Base URL: ${config.baseUrl}`);

  // Context window defaults per provider
  const contextWindows: Record<string, number> = {
    deepseek: 65536,
    anthropic: 200000,
    "anthropic-messages": 200000,
    google: 1048576,
    openai: 128000,
  };
  const contextWindow = contextWindows[config.provider] || 32768;

  // Construct model descriptor
  const model: Model<Api> = {
    id: config.model,
    name: config.model,
    api,
    provider: config.provider,
    baseUrl: config.baseUrl,
    reasoning: config.thinkingLevel !== "off",
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    maxTokens: config.maxTokens,
  };

  return model;
}
