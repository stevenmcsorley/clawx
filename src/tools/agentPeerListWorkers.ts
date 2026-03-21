import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';

export const agentPeerListWorkersTool: ToolDefinition = {
  name: 'agent_peer_list_workers',
  label: 'List Peer Workers',
  description: 'List connected workers behind a registered remote peer master',
  parameters: {
    type: 'object',
    properties: {
      peer_name: { type: 'string', description: 'Registered peer master name' },
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

      const remoteAgents = await response.json() as any[];
      const workers = remoteAgents
        .filter((agent: any) => agent?.id && agent?.name)
        .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));

      if (workers.length === 0) {
        return {
          content: [{ type: 'text', text: `🌐 ${peer.name} has no connected workers.` }],
          details: { peer_name: peer.name, endpoint: peer.endpoint, worker_count: 0, workers: [] },
        };
      }

      const lines = workers.map((worker: any) => {
        const status = worker.status || 'connected';
        const endpoint = worker.endpoint || 'n/a';
        return `- ${worker.name} (${worker.id})\n  - Status: ${status}\n  - Endpoint: ${endpoint}`;
      });

      return {
        content: [{
          type: 'text',
          text: `🌐 ${peer.name} workers (${workers.length})\n\n${lines.join('\n')}`,
        }],
        details: {
          peer_name: peer.name,
          endpoint: peer.endpoint,
          worker_count: workers.length,
          workers: workers.map((worker: any) => ({
            id: worker.id,
            name: worker.name,
            status: worker.status || 'connected',
            endpoint: worker.endpoint,
          })),
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
