import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';

export const agentPeerSendTool: ToolDefinition = {
  name: 'agent_peer_send',
  label: 'Send Task to Peer Master',
  description: 'Send a tool task to another Clawx master registered as a remote peer',
  parameters: {
    type: 'object',
    properties: {
      peer_name: { type: 'string', description: 'Registered peer master name' },
      tool: { type: 'string', description: 'Tool name to execute on the peer master' },
      params: { type: 'object', description: 'Tool parameters', default: {} },
    },
    required: ['peer_name', 'tool'],
  },
  async execute(_toolCallId: string, params: any) {
    const peerName = params.peer_name;
    const tool = params.tool;
    const toolParams = params.params || {};
    const registry = new AgentRegistryManager();
    const peer = registry.getAgentByName(peerName);
    if (!peer || peer.type !== 'remote' || !peer.endpoint) {
      return { content: [{ type: 'text', text: `❌ Peer master not found: ${peerName}` }], isError: true };
    }

    const response = await fetch(`${peer.endpoint}/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool,
        params: toolParams,
        context: { __transport: 'peer_http' },
      }),
    });

    if (!response.ok) {
      return { content: [{ type: 'text', text: `❌ Peer task dispatch failed: ${response.status}` }], isError: true };
    }

    const accepted: any = await response.json();
    const taskId = accepted.taskId || accepted.id;
    if (!taskId) {
      return {
        content: [{ type: 'text', text: `⚠️ Peer accepted request but did not return a task ID\n${JSON.stringify(accepted, null, 2)}` }],
        details: { peer_name: peer.name, endpoint: peer.endpoint, accepted },
      };
    }

    const waitUntil = Date.now() + 30000;
    let finalStatus = 'pending';
    let finalResult: any = null;

    while (Date.now() < waitUntil) {
      const statusResponse = await fetch(`${peer.endpoint}/task/${taskId}/status`);
      if (statusResponse.ok) {
        const statusJson: any = await statusResponse.json();
        finalStatus = statusJson.status || finalStatus;
        if (finalStatus === 'completed' || finalStatus === 'failed' || finalStatus === 'cancelled') {
          const resultResponse = await fetch(`${peer.endpoint}/task/${taskId}/result`);
          if (resultResponse.ok) {
            const resultJson: any = await resultResponse.json();
            finalResult = resultJson.result;
          }
          break;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return {
      content: [{
        type: 'text',
        text: finalStatus === 'completed'
          ? `🌐 Peer task ${taskId} completed\n${typeof finalResult === 'string' ? finalResult : JSON.stringify(finalResult, null, 2)}`
          : `🌐 Peer task ${taskId} status: ${finalStatus}`,
      }],
      details: { peer_name: peer.name, endpoint: peer.endpoint, task_id: taskId, status: finalStatus, result: finalResult },
      isError: finalStatus === 'failed',
    };
  },
};
