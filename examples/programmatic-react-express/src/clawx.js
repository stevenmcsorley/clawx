import { loadConfig, runAgent } from "@halfagiraf/clawx";

export function getConfig() {
  return loadConfig({
    provider: process.env.CLAWDEX_PROVIDER || "deepseek",
    baseUrl: process.env.CLAWDEX_BASE_URL || "https://api.deepseek.com/v1",
    model: process.env.CLAWDEX_MODEL || "deepseek-chat",
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.CLAWDEX_API_KEY,
    workDir: process.cwd(),
    maxTokens: 8192,
  });
}

export async function runClawxTask({ prompt, messages = [], onEvent, signal, parseTextToolCalls = false, noTools = false }) {
  const config = getConfig();

  const result = await runAgent(config, {
    prompt,
    messages,
    onEvent,
    signal,
    parseTextToolCalls,
    noTools,
  });

  return result;
}
