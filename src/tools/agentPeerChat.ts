import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { extractReadablePeerValue, resolvePeerWorkerId, waitForPeerTaskResult } from './agentPeerTaskHelpers.js';

export const agentPeerChatTool: ToolDefinition = {
  name: 'agent_peer_chat',
  label: 'Chat with Peer Master',
  description: 'Send a chat turn to another Clawx master registered as a remote peer',
  parameters: {
    type: 'object',
    properties: {
      peer_name: { type: 'string', description: 'Registered peer master name' },
      worker_name: { type: 'string', description: 'Optional worker name on the remote peer master to route the chat to' },
      message: { type: 'string', description: 'Message to send' },
      mode: { type: 'string', description: 'Conversation mode', default: 'discussion' },
    },
    required: ['peer_name', 'message'],
  },
  async execute(_toolCallId: string, params: any) {
    const peerName = params.peer_name;
    const workerName = params.worker_name;
    const message = params.message;
    const mode = params.mode || 'discussion';
    const registry = new AgentRegistryManager();
    const peer = registry.getAgentByName(peerName);
    if (!peer || peer.type !== 'remote' || !peer.endpoint) {
      return { content: [{ type: 'text', text: `❌ Peer master not found: ${peerName}` }], isError: true };
    }

    let targetAgentId: string | undefined;
    if (workerName) {
      try {
        targetAgentId = await resolvePeerWorkerId(peer.endpoint, peer.name, workerName);
      } catch (error) {
        return {
          content: [{ type: 'text', text: error instanceof Error ? `❌ ${error.message}` : `❌ Failed to resolve remote worker ${workerName} on ${peer.name}` }],
          isError: true,
        };
      }

      const taskResponse = await fetch(`${peer.endpoint}/task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-clawx-peer-name': 'peer-master',
          'x-clawx-peer-source': 'peer-master',
        },
        body: JSON.stringify({
          tool: 'agent_chat',
          params: {
            agent_id: targetAgentId,
            message,
            mode,
          },
          context: { __transport: 'peer_http', remoteWorkerName: workerName },
        }),
      });

      if (!taskResponse.ok) {
        return { content: [{ type: 'text', text: `❌ Peer worker chat failed: ${taskResponse.status}` }], isError: true };
      }

      const accepted: any = await taskResponse.json();
      const taskId = accepted.taskId || accepted.id;
      if (!taskId) {
        return { content: [{ type: 'text', text: `❌ Peer worker chat accepted without task ID` }], isError: true };
      }

      const { status, result, error, statusSnapshot } = await waitForPeerTaskResult(peer.endpoint, taskId, 30000);
      const reply = extractReadablePeerValue(result).trim() || extractReadablePeerValue(statusSnapshot).trim();
      return {
        content: [{ type: 'text', text: status === 'completed' ? `🌐 ${peer.name} → ${workerName}: ${reply || 'No reply received'}` : `🌐 ${peer.name} → ${workerName} chat status: ${status}${error ? `\n${error}` : ''}` }],
        details: { peer_name: peer.name, worker_name: workerName, target_agent_id: targetAgentId, endpoint: peer.endpoint, task_id: taskId, status, result, error },
        isError: status === 'failed',
      };
    }

    const response = await fetch(`${peer.endpoint}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speaker: 'peer-master', target: 'server', message, mode }),
    });

    if (!response.ok) {
      return { content: [{ type: 'text', text: `❌ Peer chat failed: ${response.status}` }], isError: true };
    }

    const json: any = await response.json();
    const reply = extractReadablePeerValue(json) || JSON.stringify(json, null, 2);
    return {
      content: [{ type: 'text', text: `🌐 ${peer.name}: ${reply}` }],
      details: { peer_name: peer.name, worker_name: workerName, endpoint: peer.endpoint, response: json },
    };
  },
};
