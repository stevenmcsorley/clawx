import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';

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
          agent_name: workerName,
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
        context: { __transport: 'peer_http' },
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

    const waitUntil = Date.now() + 30000;
    while (Date.now() < waitUntil) {
      const statusResponse = await fetch(`${peer.endpoint}/task/${taskId}/status`);
      if (statusResponse.ok) {
        const statusJson: any = await statusResponse.json();
        if (statusJson.status === 'completed' || statusJson.status === 'failed' || statusJson.status === 'cancelled') {
          const resultResponse = await fetch(`${peer.endpoint}/task/${taskId}/result`);
          if (resultResponse.ok) {
            const resultJson: any = await resultResponse.json();
            const text = resultJson?.result?.content?.map((item: any) => item?.text).filter(Boolean).join('\n') || JSON.stringify(resultJson?.result, null, 2);
            return {
              content: [{ type: 'text', text: `🌐 ${peer.name} → ${workerName}\n${text}` }],
              details: { peer_name: peer.name, worker_name: workerName, task_id: taskId, status: statusJson.status, result: resultJson?.result },
              isError: statusJson.status === 'failed',
            };
          }
          break;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return { content: [{ type: 'text', text: `❌ Timed out waiting for peer persona set result from ${peer.name}` }], isError: true };
  },
};
