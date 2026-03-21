import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { extractReadablePeerValue, waitForPeerTaskResult } from './agentPeerTaskHelpers.js';

function normalizePeerToolParams(tool: string, params: any): any {
  if (!params || typeof params !== 'object') return params || {};

  if (tool === 'write') {
    return {
      ...params,
      ...(params.file_path && !params.path ? { path: params.file_path } : {}),
    };
  }

  if (tool === 'edit') {
    return {
      ...params,
      ...(params.file_path && !params.path ? { path: params.file_path } : {}),
      ...(params.old_string && !params.oldText ? { oldText: params.old_string } : {}),
      ...(params.new_string && !params.newText ? { newText: params.new_string } : {}),
    };
  }

  if (tool === 'read') {
    return {
      ...params,
      ...(params.file_path && !params.path ? { path: params.file_path } : {}),
    };
  }

  return params;
}

function summarizePeerTaskDetail(tool: string, params: any): string {
  if (tool === 'bash' && typeof params?.command === 'string') {
    const oneLine = params.command.replace(/\s+/g, ' ').trim();
    return oneLine.length > 120 ? `${oneLine.slice(0, 117)}...` : oneLine;
  }
  if ((tool === 'read' || tool === 'write' || tool === 'edit') && typeof params?.path === 'string') {
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

export const agentPeerSendTool: ToolDefinition = {
  name: 'agent_peer_send',
  label: 'Send Task to Peer Master',
  description: 'Send a tool task to another Clawx master registered as a remote peer',
  parameters: {
    type: 'object',
    properties: {
      peer_name: { type: 'string', description: 'Registered peer master name' },
      worker_name: { type: 'string', description: 'Optional worker name on the remote peer master to route the task to' },
      tool: { type: 'string', description: 'Tool name to execute on the peer master' },
      params: { type: 'object', description: 'Tool parameters', default: {} },
    },
    required: ['peer_name', 'tool'],
  },
  async execute(_toolCallId: string, params: any, _signal?: AbortSignal, onUpdate?: any) {
    const peerName = params.peer_name;
    const workerName = params.worker_name;
    const tool = params.tool;
    const toolParams = normalizePeerToolParams(tool, params.params || {});
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
          worker_name: workerName,
          endpoint: peer.endpoint,
          tool,
          stream: true,
        },
      });
    };

    emitPartial(`🌐 ${peer.name}${workerName ? ` → ${workerName}` : ''} starting ${tool}${detail ? `\n↳ ${detail}` : ''}`);

    let targetAgentId: string | undefined;
    if (workerName) {
      try {
        const agentsResponse = await fetch(`${peer.endpoint}/agents`);
        if (!agentsResponse.ok) {
          return { content: [{ type: 'text', text: `❌ Failed to list workers on peer ${peer.name}` }], isError: true };
        }
        const remoteAgents = await agentsResponse.json() as any[];
        const worker = remoteAgents.find((agent: any) => agent?.name === workerName);
        if (!worker?.id) {
          return { content: [{ type: 'text', text: `❌ Worker not found on ${peer.name}: ${workerName}` }], isError: true };
        }
        targetAgentId = worker.id;
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Failed to resolve remote worker ${workerName} on ${peer.name}: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }

    const response = await fetch(`${peer.endpoint}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-clawx-peer-name': 'peer-master',
        'x-clawx-peer-source': 'peer-master',
      },
      body: JSON.stringify({
        tool,
        params: toolParams,
        targetAgentId,
        context: { __transport: 'peer_http', remoteWorkerName: workerName },
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

    let announcedRunning = false;
    const waitUntil = Date.now() + 30000;
    let finalStatus = 'pending';
    while (Date.now() < waitUntil) {
      const statusResponse = await fetch(`${peer.endpoint}/task/${taskId}/status`);
      if (statusResponse.ok) {
        const statusJson: any = await statusResponse.json();
        finalStatus = statusJson.status || finalStatus;
        if (!announcedRunning && (finalStatus === 'running' || finalStatus === 'pending')) {
          emitPartial(`🌐 ${peer.name}${workerName ? ` → ${workerName}` : ''} running ${tool}${detail ? `\n↳ ${detail}` : ''}`);
          announcedRunning = true;
        }
        if (finalStatus === 'completed' || finalStatus === 'failed' || finalStatus === 'cancelled') {
          break;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const { status: settledStatus, result: finalResult } = await waitForPeerTaskResult(peer.endpoint, taskId, 2000);
    if (settledStatus !== 'pending') {
      finalStatus = settledStatus;
    }

    const durationMs = Date.now() - startedAt;
    const durationText = `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 0 : 1)}s`;
    const readable = extractReadablePeerValue(finalResult).trim();

    if (finalStatus === 'completed') {
      emitPartial(`✅ ${peer.name}${workerName ? ` → ${workerName}` : ''} completed ${tool} (${durationText})`);
    } else if (finalStatus === 'failed') {
      emitPartial(`❌ ${peer.name}${workerName ? ` → ${workerName}` : ''} failed ${tool} (${durationText})`);
    } else if (finalStatus === 'cancelled') {
      emitPartial(`⏹️ ${peer.name}${workerName ? ` → ${workerName}` : ''} cancelled ${tool} (${durationText})`);
    }

    return {
      content: [{
        type: 'text',
        text: finalStatus === 'completed'
          ? `🌐 ${peer.name}${workerName ? ` → ${workerName}` : ''} completed ${tool}${readable ? `\n${readable}` : ''}`
          : `🌐 Peer task ${taskId} status: ${finalStatus}`,
      }],
      details: { peer_name: peer.name, worker_name: workerName, endpoint: peer.endpoint, task_id: taskId, status: finalStatus, result: finalResult, tool, target_agent_id: targetAgentId },
      isError: finalStatus === 'failed',
    };
  },
};
