import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { extractReadablePeerValue, resolvePeerWorkerId, waitForPeerTaskResult } from './agentPeerTaskHelpers.js';

export const agentPeerPersonaSetTool: ToolDefinition = {
  name: 'agent_peer_persona_set',
  label: 'Set Peer Worker Persona',
  description: 'Write or replace persona card for a named worker behind a registered remote peer master',
  parameters: {
    type: 'object',
    properties: {
      peer_name: { type: 'string', description: 'Registered peer master name' },
      worker_name: { type: 'string', description: 'Worker name on the remote peer master' },
      name: { type: 'string', description: 'Persona display name' },
      role: { type: 'string', description: 'Persona role description' },
      tone: { type: 'string', description: 'Communication tone and style' },
      decision_style: { type: 'string', description: 'Decision-making style' },
      strengths: { type: 'array', items: { type: 'string' }, description: 'Key strengths and capabilities' },
      biases: { type: 'array', items: { type: 'string' }, description: 'Known biases or preferences' },
      goals: { type: 'array', items: { type: 'string' }, description: 'Current goals or objectives' },
      boundaries: { type: 'array', items: { type: 'string' }, description: 'Boundaries or constraints' },
      relationship_to_master: { type: 'string', description: 'Relationship to master/other agents' },
      notes: { type: 'string', description: 'Additional notes or instructions' },
      version: { type: 'string', description: 'Persona version', default: '1.0.0' },
      replace: { type: 'boolean', description: 'Replace existing persona completely', default: false },
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
        tool: 'agent_persona_set',
        params: {
          agent_id: targetAgentId,
          name: params.name,
          role: params.role,
          tone: params.tone,
          decision_style: params.decision_style,
          strengths: params.strengths || [],
          biases: params.biases || [],
          goals: params.goals || [],
          boundaries: params.boundaries || [],
          relationship_to_master: params.relationship_to_master,
          notes: params.notes,
          version: params.version || '1.0.0',
          replace: params.replace === true,
        },
        context: { __transport: 'peer_http', remoteWorkerName: workerName },
      }),
    });

    if (!response.ok) {
      return { content: [{ type: 'text', text: `❌ Peer persona set failed: ${response.status}` }], isError: true };
    }

    const accepted: any = await response.json();
    const taskId = accepted.taskId || accepted.id;
    if (!taskId) {
      return { content: [{ type: 'text', text: `❌ Peer persona set accepted without task ID` }], isError: true };
    }

    const { status, result, error, statusSnapshot } = await waitForPeerTaskResult(peer.endpoint, taskId, 30000);
    const text = extractReadablePeerValue(result).trim() || extractReadablePeerValue(statusSnapshot).trim();
    return {
      content: [{ type: 'text', text: status === 'completed' ? `🌐 ${peer.name} → ${workerName}\n${text || 'Persona updated.'}` : `❌ Peer persona set ${status}${error ? `\n${error}` : ''}` }],
      details: { peer_name: peer.name, worker_name: workerName, target_agent_id: targetAgentId, task_id: taskId, status, result, error },
      isError: status === 'failed' || status === 'pending' || status === 'cancelled',
    };
  },
};
