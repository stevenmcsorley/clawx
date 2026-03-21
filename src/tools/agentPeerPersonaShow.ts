import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';

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

    return { content: [{ type: 'text', text: `❌ Timed out waiting for peer persona show result from ${peer.name}` }], isError: true };
  },
};
