import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { extractReadablePeerValue, waitForPeerTaskResult } from './agentPeerTaskHelpers.js';

export const agentPeerPersonaShowTool: ToolDefinition = {
  name: 'agent_peer_persona_show',
  label: 'Show Peer Worker Persona',
  description: 'Show persona card and memory for a named worker behind a registered remote peer master',
  parameters: {
    type: 'object',
    properties: {
      peer_name: { type: 'string', description: 'Registered peer master name' },
      worker_name: { type: 'string', description: 'Worker name on the remote peer master' },
      show_memory: { type: 'boolean', description: 'Show memory information', default: true },
      show_conversation: { type: 'boolean', description: 'Show recent conversation turns', default: false },
    },
    required: ['peer_name', 'worker_name'],
  },
  async execute(_toolCallId: string, params: any) {
    const peerName = params.peer_name;
    const workerName = params.worker_name;
    const registry = new AgentRegistryManager();
    const peer = registry.getAgentByName(peerName);
    if (!peer || peer.type !== 'remote' || !peer.endpoint) {
      return { content: [{ type: 'text', text: `❌ Peer master not found: ${peerName}` }], isError: true };
    }

    const response = await fetch(`${peer.endpoint}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-clawx-peer-name': 'peer-master',
        'x-clawx-peer-source': 'peer-master',
      },
      body: JSON.stringify({
        tool: 'agent_persona_show',
        params: {
          agent_name: workerName,
          show_memory: params.show_memory !== false,
          show_conversation: params.show_conversation === true,
        },
        context: { __transport: 'peer_http' },
      }),
    });

    if (!response.ok) {
      return { content: [{ type: 'text', text: `❌ Peer persona show failed: ${response.status}` }], isError: true };
    }

    const accepted: any = await response.json();
    const taskId = accepted.taskId || accepted.id;
    if (!taskId) {
      return { content: [{ type: 'text', text: `❌ Peer persona show accepted without task ID` }], isError: true };
    }

    const { status, result, error } = await waitForPeerTaskResult(peer.endpoint, taskId, 30000);
    const text = extractReadablePeerValue(result).trim();
    return {
      content: [{ type: 'text', text: status === 'completed' ? `🌐 ${peer.name} → ${workerName}\n${text || 'No persona output received'}` : `❌ Peer persona show ${status}${error ? `\n${error}` : ''}` }],
      details: { peer_name: peer.name, worker_name: workerName, task_id: taskId, status, result, error },
      isError: status === 'failed' || status === 'pending' || status === 'cancelled',
    };
  },
};
