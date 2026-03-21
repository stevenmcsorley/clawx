import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { resolvePeerWorkerId } from './agentPeerTaskHelpers.js';

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

      const enrichedWorkers = await Promise.all(workers.map(async (worker: any) => {
        try {
          const targetAgentId = await resolvePeerWorkerId(peer.endpoint!, peer.name, worker.name);

          const personaResp = await fetch(`${peer.endpoint}/task`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-clawx-peer-name': 'peer-master',
              'x-clawx-peer-source': 'peer-master',
            },
            body: JSON.stringify({
              tool: 'agent_persona_show',
              params: { agent_id: targetAgentId, show_memory: false, show_conversation: false },
              context: { __transport: 'peer_http', remoteWorkerName: worker.name },
            }),
          });

          const memoryResp = await fetch(`${peer.endpoint}/task`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-clawx-peer-name': 'peer-master',
              'x-clawx-peer-source': 'peer-master',
            },
            body: JSON.stringify({
              tool: 'agent_memory_show',
              params: { agent_id: targetAgentId, recent_turns: 0 },
              context: { __transport: 'peer_http', remoteWorkerName: worker.name },
            }),
          });

          let personaSummary = 'none';
          let memorySummary = 'none';

          if (personaResp.ok) {
            const personaAccepted: any = await personaResp.json();
            const personaTaskId = personaAccepted.taskId || personaAccepted.id;
            if (personaTaskId) {
              const personaResultResp = await fetch(`${peer.endpoint}/task/${personaTaskId}/result`);
              if (personaResultResp.ok) {
                const personaResult: any = await personaResultResp.json();
                const text = personaResult?.result?.content?.map((item: any) => item?.text).filter(Boolean).join('\n') || '';
                if (text.includes('No persona file found')) {
                  personaSummary = 'none';
                } else {
                  const roleMatch = text.match(/\*\*Role\*\*: (.+)/);
                  const nameMatch = text.match(/## (.+)/);
                  const personaName = nameMatch?.[1]?.trim();
                  const personaRole = roleMatch?.[1]?.trim();
                  personaSummary = summarizeText([personaName, personaRole].filter(Boolean).join(' — '));
                }
              }
            }
          }

          if (memoryResp.ok) {
            const memoryAccepted: any = await memoryResp.json();
            const memoryTaskId = memoryAccepted.taskId || memoryAccepted.id;
            if (memoryTaskId) {
              const memoryResultResp = await fetch(`${peer.endpoint}/task/${memoryTaskId}/result`);
              if (memoryResultResp.ok) {
                const memoryResult: any = await memoryResultResp.json();
                const text = memoryResult?.result?.content?.map((item: any) => item?.text).filter(Boolean).join('\n') || '';
                if (text.includes('No memory file found')) {
                  memorySummary = 'none';
                } else {
                  const summaryMatch = text.match(/## Summary\n([\s\S]*?)\n\n\*\*Updated\*\*/);
                  memorySummary = summarizeText(summaryMatch?.[1]);
                }
              }
            }
          }

          return {
            id: worker.id,
            name: worker.name,
            status: worker.status || 'connected',
            endpoint: worker.endpoint,
            workspace: worker.workspace || `~/.clawx/agents/${worker.id}`,
            persona_summary: personaSummary,
            memory_summary: memorySummary,
            allowed_tools: worker.capabilities?.length ? worker.capabilities : ['all'],
          };
        } catch {
          return {
            id: worker.id,
            name: worker.name,
            status: worker.status || 'connected',
            endpoint: worker.endpoint,
            workspace: worker.workspace || `~/.clawx/agents/${worker.id}`,
            persona_summary: 'unknown',
            memory_summary: 'unknown',
            allowed_tools: worker.capabilities?.length ? worker.capabilities : ['all'],
          };
        }
      }));

      const lines = enrichedWorkers.map((worker: any) => {
        const status = worker.status || 'connected';
        const endpoint = worker.endpoint || 'n/a';
        const tools = Array.isArray(worker.allowed_tools) ? worker.allowed_tools.join(', ') : 'all';
        return `- ${worker.name} (${worker.id})\n  - Status: ${status}\n  - Endpoint: ${endpoint}\n  - Workspace: ${worker.workspace}\n  - Persona: ${worker.persona_summary}\n  - Memory: ${worker.memory_summary}\n  - Allowed tools: ${tools}`;
      });

      return {
        content: [{
          type: 'text',
          text: `🌐 ${peer.name} workers (${enrichedWorkers.length})\n\n${lines.join('\n')}`,
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
