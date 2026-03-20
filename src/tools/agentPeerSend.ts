import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';

function summarizePeerTaskDetail(tool: string, params: any): string {
  if (tool === 'bash' && typeof params?.command === 'string') {
    const oneLine = params.command.replace(/\s+/g, ' ').trim();
    return oneLine.length > 120 ? `${oneLine.slice(0, 117)}...` : oneLine;
  }
  if (tool === 'read' && typeof params?.path === 'string') {
    return params.path;
  }
  if (tool === 'write' && typeof params?.path === 'string') {
    return params.path;
  }
  if (tool === 'search_files' && typeof params?.pattern === 'string') {
    return `pattern: ${params.pattern}`;
  }
  if (tool === 'ls' && typeof params?.path === 'string') {
    return params.path;
  }
  return '';
}

function extractReadablePeerResult(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        const nested = extractReadablePeerResult(parsed);
        if (nested) return nested;
      } catch {}
    }
    return value;
  }
  if (Array.isArray(value?.content)) {
    return value.content
      .filter((item: any) => item?.type === 'text' && typeof item.text === 'string')
      .map((item: any) => item.text)
      .join('\n');
  }
  if (typeof value?.output === 'string') {
    const nested = extractReadablePeerResult(value.output);
    return nested || value.output;
  }
  if (value?.details) {
    const nested = extractReadablePeerResult(value.details);
    if (nested) return nested;
  }
  if (value?.result) {
    const nested = extractReadablePeerResult(value.result);
    if (nested) return nested;
  }
  return '';
}

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
  async execute(_toolCallId: string, params: any, _signal?: AbortSignal, onUpdate?: any) {
    const peerName = params.peer_name;
    const tool = params.tool;
    const toolParams = params.params || {};
    const registry = new AgentRegistryManager();
    const peer = registry.getAgentByName(peerName);
    if (!peer || peer.type !== 'remote' || !peer.endpoint) {
      return { content: [{ type: 'text', text: `❌ Peer master not found: ${peerName}` }], isError: true };
    }

    const startedAt = Date.now();
    const detail = summarizePeerTaskDetail(tool, toolParams);
    const emitPartial = (text: string) => {
      onUpdate?.({
        content: [{ type: 'text', text }],
        details: {
          peer_name: peer.name,
          endpoint: peer.endpoint,
          tool,
          stream: true,
        },
      });
    };

    emitPartial(`🌐 ${peer.name} starting ${tool}${detail ? `\n↳ ${detail}` : ''}`);

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
      emitPartial(`❌ ${peer.name} failed to start ${tool} (${response.status})`);
      return { content: [{ type: 'text', text: `❌ Peer task dispatch failed: ${response.status}` }], isError: true };
    }

    const accepted: any = await response.json();
    const taskId = accepted.taskId || accepted.id;
    if (!taskId) {
      emitPartial(`⚠️ ${peer.name} accepted ${tool} but returned no task ID`);
      return {
        content: [{ type: 'text', text: `⚠️ Peer accepted request but did not return a task ID\n${JSON.stringify(accepted, null, 2)}` }],
        details: { peer_name: peer.name, endpoint: peer.endpoint, accepted },
      };
    }

    const waitUntil = Date.now() + 30000;
    let finalStatus = 'pending';
    let finalResult: any = null;

    let announcedRunning = false;
    while (Date.now() < waitUntil) {
      const statusResponse = await fetch(`${peer.endpoint}/task/${taskId}/status`);
      if (statusResponse.ok) {
        const statusJson: any = await statusResponse.json();
        finalStatus = statusJson.status || finalStatus;
        if (!announcedRunning && (finalStatus === 'running' || finalStatus === 'pending')) {
          emitPartial(`🌐 ${peer.name} running ${tool}${detail ? `\n↳ ${detail}` : ''}`);
          announcedRunning = true;
        }
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

    const durationMs = Date.now() - startedAt;
    const durationText = `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 0 : 1)}s`;
    const readable = extractReadablePeerResult(finalResult).trim();

    if (finalStatus === 'completed') {
      emitPartial(`✅ ${peer.name} completed ${tool} (${durationText})`);
    } else if (finalStatus === 'failed') {
      emitPartial(`❌ ${peer.name} failed ${tool} (${durationText})`);
    } else if (finalStatus === 'cancelled') {
      emitPartial(`⏹️ ${peer.name} cancelled ${tool} (${durationText})`);
    }

    return {
      content: [{
        type: 'text',
        text: finalStatus === 'completed'
          ? `🌐 ${peer.name} completed ${tool}${readable ? `\n${readable}` : ''}`
          : `🌐 Peer task ${taskId} status: ${finalStatus}`,
      }],
      details: { peer_name: peer.name, endpoint: peer.endpoint, task_id: taskId, status: finalStatus, result: finalResult, tool },
      isError: finalStatus === 'failed',
    };
  },
};
