import { createAgentSession, InteractiveMode, AuthStorage, ModelRegistry, DefaultResourceLoader, SettingsManager } from '@mariozechner/pi-coding-agent';
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '../config/index.js';
import { resolveModel } from '../core/provider.js';
import { buildSystemPrompt } from '../utils/system-prompt.js';
import { log } from '../utils/logger.js';

export async function startPeerObserverTui(workspace: string, agentName: string): Promise<void> {
  const config = loadConfig({ workDir: workspace });
  const model = resolveModel(config);
  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey(config.provider, config.apiKey);

  const modelRegistry = new ModelRegistry(authStorage);
  modelRegistry.registerProvider(config.provider, {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    api: (model as any).api,
    models: [{
      id: (model as any).id,
      name: (model as any).name ?? (model as any).id,
      reasoning: (model as any).reasoning ?? false,
      input: (model as any).input ?? ['text'],
      cost: (model as any).cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: (model as any).contextWindow ?? 32768,
      maxTokens: (model as any).maxTokens ?? config.maxTokens,
    }],
  });

  const resourceLoader = new DefaultResourceLoader({ cwd: workspace });
  const settingsManager = SettingsManager.create(workspace);
  settingsManager.setQuietStartup(true);

  const { session } = await createAgentSession({
    cwd: workspace,
    model: model as any,
    thinkingLevel: undefined,
    customTools: [],
    authStorage,
    modelRegistry,
    resourceLoader,
    settingsManager,
  });

  session.agent.setSystemPrompt(buildSystemPrompt(config));

  const mode = new InteractiveMode(session, {
    initialMessage: `Peer observer for ${agentName}. Watching incoming peer activity...`,
  });

  const logPath = join(workspace, 'peer-activity.log');
  let lastSize = existsSync(logPath) ? statSync(logPath).size : 0;

  setInterval(async () => {
    try {
      if (!existsSync(logPath)) return;
      const stats = statSync(logPath);
      if (stats.size <= lastSize) return;
      const content = readFileSync(logPath, 'utf8');
      const delta = content.slice(lastSize);
      lastSize = stats.size;
      const lines = delta.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      for (const line of lines) {
        await session.sendCustomMessage({
          customType: 'peer-activity',
          content: [{ type: 'text', text: line }],
          display: true,
          details: { source: 'peer-activity.log' },
        }, { triggerTurn: false });
      }
    } catch (error) {
      log.debug('peer observer poll failed:', error instanceof Error ? error.message : String(error));
    }
  }, 1000);

  await mode.run();
}
