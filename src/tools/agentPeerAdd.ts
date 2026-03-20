import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { log } from '../utils/logger.js';

export const agentPeerAddTool: ToolDefinition = {
  name: 'agent_peer_add',
  label: 'Add Peer Master',
  description: 'Register another Clawx master on the LAN as a remote peer',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Peer display name' },
      endpoint: { type: 'string', description: 'Peer master HTTP endpoint, e.g. http://192.168.1.50:43210' },
    },
    required: ['name', 'endpoint'],
  },
  async execute(_toolCallId: string, params: any) {
    const name = params.name;
    const endpoint = params.endpoint;
    if (!name || !endpoint) {
      return { content: [{ type: 'text', text: '❌ name and endpoint are required' }], isError: true };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${endpoint}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}`);
      }
      const health: any = await response.json();

      const registry = new AgentRegistryManager();
      const existing = registry.getAgentByName(name);
      const id = existing?.id || `peer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      registry.upsertAgent({
        id,
        name,
        type: 'remote',
        status: 'idle',
        capabilities: ['peer_master'],
        endpoint,
        workspace: endpoint,
        created: existing?.created || Date.now(),
        lastHeartbeat: Date.now(),
        persona: {
          loaded: true,
          name,
          role: 'remote peer master',
        },
        platform: health.platform,
      });
      registry.save();

      return {
        content: [{ type: 'text', text: `✅ Added peer master "${name}" at ${endpoint}` }],
        details: { name, endpoint, health },
      };
    } catch (error) {
      log.error('Failed adding peer master:', error);
      return {
        content: [{ type: 'text', text: `❌ Failed to add peer master: ${error instanceof Error ? error.message : String(error)}` }],
        details: { error: error instanceof Error ? error.message : String(error) },
        isError: true,
      };
    }
  },
};
