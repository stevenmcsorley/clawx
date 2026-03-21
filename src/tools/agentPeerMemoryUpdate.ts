import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { extractReadablePeerValue, resolvePeerWorkerId, waitForPeerTaskResult } from './agentPeerTaskHelpers.js';

export const agentPeerMemoryUpdateTool: ToolDefinition = {
  name: 'agent_peer_memory_update',
  label: 'Update Peer Worker Memory',
  description: 'Save or replace memory summary for a named worker behind a registered remote peer master',
  parameters: {
    type: 'object',
    properties: {
      peer_name: { type: 'string', description: 'Registered peer master name' },
      worker_name: { type: 'string', description: 'Worker name on the remote peer master' },
      summary: { type: 'string', description: 'New memory summary' },
      key_facts: { type: 'array', items: { type: 'string' }, description: 'Key facts or knowledge to remember' },
      recent_context: { type: 'array', items: { type: 'string' }, description: 'Recent conversation context' },
      replace: { type: 'boolean', description: 'Replace memory completely', default: false },
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

    let targetAgentId: string;
    try {
      targetAgentId = await resolvePeerWorkerId(peer.endpoint, peer.name, workerName);
    } catch (error) {
      return {
        content: [{ type: 'text', text: error instanceof Error ? `❌ ${error.message}` : `❌ Failed to resolve remote worker ${workerName} on ${peer.name}` }],
        isError: true,
      };
    }

    const response = await fetch(`${peer.endpoint}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-clawx-peer-name': 'peer-master',
        'x-clawx-peer-source': 'peer-master',
      },
      body: JSON.stringify({
        tool: 'agent_memory_update',
        params: {
          agent_id: targetAgentId,
          summary: params.summary,
          key_facts: params.key_facts || [],
          recent_context: params.recent_context || [],
          replace: params.replace === true,
        },
        context: { __transport: 'peer_http', remoteWorkerName: workerName },
      }),
    });

    if (!response.ok) {
      return { content: [{ type: 'text', text: `❌ Peer memory update failed: ${response.status}` }], isError: true };
    }

    const accepted: any = await response.json();
    const taskId = accepted.taskId || accepted.id;
    if (!taskId) {
      return { content: [{ type: 'text', text: `❌ Peer memory update accepted without task ID` }], isError: true };
    }

    const { status, result, error, statusSnapshot } = await waitForPeerTaskResult(peer.endpoint, taskId, 30000);
    const text = extractReadablePeerValue(result).trim() || extractReadablePeerValue(statusSnapshot).trim();
    return {
      content: [{ type: 'text', text: status === 'completed' ? `🌐 ${peer.name} → ${workerName}\n${text || 'Memory updated.'}` : `❌ Peer memory update ${status}${error ? `\n${error}` : ''}` }],
      details: { peer_name: peer.name, worker_name: workerName, target_agent_id: targetAgentId, task_id: taskId, status, result, error },
      isError: status === 'failed' || status === 'pending' || status === 'cancelled',
    };
  },
};
