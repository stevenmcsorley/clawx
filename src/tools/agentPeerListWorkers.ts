import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { loadPersona, loadMemory } from '../utils/persona-utils.js';

function summarizeText(value: string | undefined, max = 120): string {
  if (!value) return 'n/a';
  const oneLine = value.replace(/\s+/g, ' ').trim();
  if (!oneLine) return 'n/a';
  return oneLine.length > max ? `${oneLine.slice(0, max - 3)}...` : oneLine;
}

export const agentPeerListWorkersTool: ToolDefinition = {
  name: 'agent_peer_list_workers',
  label: 'List Peer Workers',
  description: 'List connected workers behind a registered remote peer master',
  parameters: {
    type: 'object',
    properties: {
      peer_name: { type: 'string', description: 'Registered peer master name' },
      include_offline: { type: 'boolean', description: 'Include offline historical workers from the peer registry', default: false },
      max_workers: { type: 'number', description: 'Maximum workers to show', default: 20 },
    },
    required: ['peer_name'],
  },
  async execute(_toolCallId: string, params: any) {
    const peerName = params.peer_name;
    const registry = new AgentRegistryManager();
    const peer = registry.getAgentByName(peerName);
    if (!peer || peer.type !== 'remote' || !peer.endpoint) {
      return { content: [{ type: 'text', text: `❌ Peer master not found: ${peerName}` }], isError: true };
    }

    try {
      const response = await fetch(`${peer.endpoint}/agents`);
      if (!response.ok) {
        return {
          content: [{ type: 'text', text: `❌ Failed to list workers on ${peer.name}: ${response.status}` }],
          isError: true,
        };
      }

      const includeOffline = params.include_offline === true;
      const maxWorkers = typeof params.max_workers === 'number' && params.max_workers > 0 ? params.max_workers : 20;

      const remoteAgents = await response.json() as any[];
      const connectedWorkers = remoteAgents
        .filter((agent: any) => agent?.id && agent?.name)
        .map((worker: any) => ({ ...worker, source: 'connected' as const }));

      const connectedIds = new Set(connectedWorkers.map((worker: any) => worker.id));
      const connectedNames = new Set(connectedWorkers.map((worker: any) => worker.name));

      let historicalWorkers: any[] = [];
      if (includeOffline) {
        const peerRegistryResponse = await fetch(`${peer.endpoint}/agents?include_offline=true`).catch(() => null as any);
        if (peerRegistryResponse?.ok) {
          const peerRegistryAgents = await peerRegistryResponse.json() as any[];
          historicalWorkers = peerRegistryAgents
            .filter((agent: any) => agent?.id && agent?.name && !connectedIds.has(agent.id) && !connectedNames.has(agent.name))
            .map((worker: any) => ({ ...worker, source: 'historical' as const }));
        }
      }

      const workers = [...connectedWorkers, ...historicalWorkers]
        .sort((a: any, b: any) => {
          const sourceRank = (a.source === 'connected' ? 0 : 1) - (b.source === 'connected' ? 0 : 1);
          if (sourceRank !== 0) return sourceRank;
          return String(a.name).localeCompare(String(b.name));
        })
        .slice(0, maxWorkers);

      if (workers.length === 0) {
        return {
          content: [{ type: 'text', text: `🌐 ${peer.name} has no ${includeOffline ? '' : 'connected '}workers.` }],
          details: { peer_name: peer.name, endpoint: peer.endpoint, worker_count: 0, workers: [] },
        };
      }

      const enrichedWorkers = workers.map((worker: any) => {
        const workspace = worker.workspace || `~/.clawx/agents/${worker.id}`;
        const persona = loadPersona(workspace);
        const memory = loadMemory(workspace);
        return {
          id: worker.id,
          name: worker.name,
          status: worker.status || (worker.source === 'connected' ? 'connected' : 'offline'),
          endpoint: worker.endpoint,
          workspace,
          source: worker.source,
          auto_start: worker.autoStart,
          created: worker.created,
          last_heartbeat: worker.lastHeartbeat,
          persona_summary: persona ? summarizeText(`${persona.name} — ${persona.role}`) : 'none',
          memory_summary: memory ? summarizeText(memory.summary) : 'none',
          allowed_tools: worker.capabilities?.length ? worker.capabilities : ['all'],
        };
      });

      const lines = enrichedWorkers.map((worker: any) => {
        const status = worker.status || 'connected';
        const endpoint = worker.endpoint || 'n/a';
        const tools = Array.isArray(worker.allowed_tools) ? worker.allowed_tools.join(', ') : 'all';
        const sourceLabel = worker.source === 'connected' ? 'connected' : 'historical';
        const createdLabel = worker.created ? new Date(worker.created).toLocaleString() : 'unknown';
        return `- ${worker.name} (${worker.id})\n  - Status: ${status}\n  - Source: ${sourceLabel}\n  - Endpoint: ${endpoint}\n  - Workspace: ${worker.workspace}\n  - Auto-start: ${worker.auto_start === false ? 'disabled' : 'enabled'}\n  - Created: ${createdLabel}\n  - Persona: ${worker.persona_summary}\n  - Memory: ${worker.memory_summary}\n  - Allowed tools: ${tools}`;
      });

      return {
        content: [{
          type: 'text',
          text: `🌐 ${peer.name} workers (${enrichedWorkers.length}${includeOffline ? ', including historical' : ', connected only'})\n\n${lines.join('\n')}`,
        }],
        details: {
          peer_name: peer.name,
          endpoint: peer.endpoint,
          worker_count: enrichedWorkers.length,
          workers: enrichedWorkers,
        },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Failed to query workers on ${peer.name}: ${error instanceof Error ? error.message : String(error)}` }],
        details: { peer_name: peer.name, endpoint: peer.endpoint },
        isError: true,
      };
    }
  },
};
