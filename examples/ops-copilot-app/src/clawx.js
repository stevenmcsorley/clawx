import { loadConfig, runAgent } from '@halfagiraf/clawx';

export function getConfig(workDir) {
  return loadConfig({
    provider: process.env.CLAWDEX_PROVIDER || 'deepseek',
    baseUrl: process.env.CLAWDEX_BASE_URL || 'https://api.deepseek.com/v1',
    model: process.env.CLAWDEX_MODEL || 'deepseek-chat',
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.CLAWDEX_API_KEY,
    workDir: workDir || process.cwd(),
    maxTokens: 8192,
  });
}

export async function runClawxTask({ prompt, messages = [], workDir, onEvent, signal }) {
  const config = getConfig(workDir);
  return runAgent(config, {
    prompt,
    messages,
    parseTextToolCalls: true,
    onEvent,
    signal,
  });
}
