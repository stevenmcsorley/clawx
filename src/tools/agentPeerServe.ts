import { ToolDefinition } from '../types/extension.js';
import { agentServeTool } from './agentServe.js';

export const agentPeerServeTool: ToolDefinition = {
  name: 'agent_peer_serve',
  label: 'Serve as Peer Master',
  description: 'Start this Clawx instance as a LAN-reachable peer master for cross-master communication',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Peer master name (default: "master")',
        default: 'master',
      },
      port: {
        type: 'number',
        description: 'Port to listen on',
        default: 43210,
      },
    },
    required: [],
  },
  async execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any, context?: any) {
    const name = params?.name || 'master';
    const port = params?.port || 43210;
    const result: any = await agentServeTool.execute(toolCallId, { name, port }, signal, onUpdate, context);

    if (result?.isError) {
      return result;
    }

    const existingText = result?.content?.[0]?.text || '';
    const suffix = `\n\n🌐 Peer-master mode enabled\n- LAN reachable HTTP server is active\n- Other Clawx masters can add this instance with agent_peer_add\n- Suggested endpoint from another machine: http://<this-machine-ip>:${port}`;

    return {
      ...result,
      content: [{ type: 'text', text: `${existingText}${suffix}` }],
      details: {
        ...(result?.details || {}),
        peer_master: true,
      },
    };
  },
};
