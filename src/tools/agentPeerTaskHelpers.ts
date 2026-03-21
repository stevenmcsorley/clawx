import { AgentRegistryManager } from '../core/agent-registry.js';

export function extractReadablePeerValue(value: any): string {
  if (value?.status === 'completed' && value?.taskId && !value?.result && !value?.content) {
    return '';
  }
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        const nested = extractReadablePeerValue(parsed);
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
  if (typeof value?.reply === 'string') return value.reply;
  if (typeof value?.message === 'string') return value.message;
  if (typeof value?.output === 'string') {
    const nested = extractReadablePeerValue(value.output);
    return nested || value.output;
  }
  if (value?.response) {
    const nested = extractReadablePeerValue(value.response);
    if (nested) return nested;
  }
  if (value?.details) {
    const nested = extractReadablePeerValue(value.details);
    if (nested) return nested;
  }
  if (value?.result) {
    const nested = extractReadablePeerValue(value.result);
    if (nested) return nested;
  }
  return '';
}

export async function resolvePeerWorker(peerName: string) {
  const registry = new AgentRegistryManager();
  const peer = registry.getAgentByName(peerName);
  if (!peer || peer.type !== 'remote' || !peer.endpoint) {
    throw new Error(`Peer master not found: ${peerName}`);
  }
  return peer;
}

export async function resolvePeerWorkerId(peerEndpoint: string, peerDisplayName: string, workerName: string): Promise<string> {
  const agentsResponse = await fetch(`${peerEndpoint}/agents`);
  if (!agentsResponse.ok) {
    throw new Error(`Failed to list workers on peer ${peerDisplayName}`);
  }
  const remoteAgents = await agentsResponse.json() as any[];
  const worker = remoteAgents.find((agent: any) => agent?.name === workerName);
  if (!worker?.id) {
    throw new Error(`Worker not found on ${peerDisplayName}: ${workerName}`);
  }
  return worker.id as string;
}

export async function waitForPeerTaskResult(peerEndpoint: string, taskId: string, timeoutMs = 30000) {
  const waitUntil = Date.now() + timeoutMs;
  let finalStatus = 'pending';
  let finalResult: any = null;
  let finalError: any = null;
  let statusSnapshot: any = null;

  while (Date.now() < waitUntil) {
    const statusResponse = await fetch(`${peerEndpoint}/task/${taskId}/status`);
    if (statusResponse.ok) {
      const statusJson: any = await statusResponse.json();
      statusSnapshot = statusJson;
      finalStatus = statusJson.status || finalStatus;
      if (finalStatus === 'completed' || finalStatus === 'failed' || finalStatus === 'cancelled') {
        const resultResponse = await fetch(`${peerEndpoint}/task/${taskId}/result`);
        if (resultResponse.ok) {
          const resultJson: any = await resultResponse.json();
          finalResult = resultJson?.result;
          finalError = resultJson?.error;
        }
        break;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if ((finalResult === null || finalResult === undefined) && statusSnapshot?.result !== undefined) {
    finalResult = statusSnapshot.result;
  }
  if ((finalError === null || finalError === undefined) && statusSnapshot?.error !== undefined) {
    finalError = statusSnapshot.error;
  }

  return { status: finalStatus, result: finalResult, error: finalError, statusSnapshot };
}
