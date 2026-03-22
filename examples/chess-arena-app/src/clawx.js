import { loadConfig, runAgent } from '@halfagiraf/clawx';

export function getConfig() {
  return loadConfig({
    provider: process.env.CLAWDEX_PROVIDER || 'deepseek',
    baseUrl: process.env.CLAWDEX_BASE_URL || 'https://api.deepseek.com/v1',
    model: process.env.CLAWDEX_MODEL || 'deepseek-chat',
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.CLAWDEX_API_KEY,
    workDir: process.cwd(),
    maxTokens: 4096,
  });
}

export async function runClawxTask({ prompt, onEvent, signal }) {
  const config = getConfig();
  return runAgent(config, {
    prompt,
    parseTextToolCalls: true,
    noTools: true,
    onEvent,
    signal,
  });
}
