import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';

export const agentPeerChatTool: ToolDefinition = {
  name: 'agent_peer_chat',
  label: 'Chat with Peer Master',
  description: 'Send a chat turn to another Clawx master registered as a remote peer',
  parameters: {
    type: 'object',
    properties: {
      peer_name: { type: 'string', description: 'Registered peer master name' },
      message: { type: 'string', description: 'Message to send' },
    },
    required: ['peer_name', 'message'],
  },
  async execute(_toolCallId: string, params: any) {
    const peerName = params.peer_name;
    const message = params.message;
    const registry = new AgentRegistryManager();
    const peer = registry.getAgentByName(peerName);
    if (!peer || peer.type !== 'remote' || !peer.endpoint) {
      return { content: [{ type: 'text', text: `❌ Peer master not found: ${peerName}` }], isError: true };
    }

    const response = await fetch(`${peer.endpoint}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speaker: 'peer-master', target: 'server', message, mode: 'discussion' }),
    });

    if (!response.ok) {
      return { content: [{ type: 'text', text: `❌ Peer chat failed: ${response.status}` }], isError: true };
    }

    const json: any = await response.json();
    const reply = json.reply || json.message || JSON.stringify(json, null, 2);
    return {
      content: [{ type: 'text', text: `🌐 ${peer.name}: ${reply}` }],
      details: { peer_name: peer.name, endpoint: peer.endpoint, response: json },
    };
  },
};
