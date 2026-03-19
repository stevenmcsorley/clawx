/**
 * gRPC Streaming Tool Helper for Master
 * 
 * Provides utilities for master tools to subscribe to worker events via gRPC
 * and display live streaming output.
 */

import { GrpcStreamingManager } from './grpc-streaming-client.js';
import { log } from './logger.js';
import type { StreamEvent } from './streaming-events.js';

export interface GrpcStreamingOptions {
  agentId: string;
  agentName: string;
  operationId: string;
  operationType: 'chat' | 'task';
  onUpdate?: (update: any) => void;
  signal?: AbortSignal;
}

export interface GrpcStreamingResult {
  finalResult: any;
  events: StreamEvent[];
}

// Global gRPC streaming manager instance
let grpcStreamingManager: GrpcStreamingManager | null = null;

function getGrpcStreamingManager(): GrpcStreamingManager {
  if (!grpcStreamingManager) {
    grpcStreamingManager = new GrpcStreamingManager();
  }
  return grpcStreamingManager;
}

/**
 * Handle stream event and forward to onUpdate callback
 */
function handleEvent(
  event: StreamEvent & { agentId: string; agentName: string },
  onUpdate?: (update: any) => void,
  operationId?: string
): void {
  if (!onUpdate) return;
  
  const { type, ...rest } = event;
  
  switch (type) {
    case 'agent_message_start':
      onUpdate({
        type: 'chat_start',
        agentId: event.agentId,
        agentName: event.agentName,
        streamKey: `${event.agentId}:${operationId}`,
        persona: (rest as any).persona,
        operationId,
      });
      break;
      
    case 'agent_message_delta':
      onUpdate({
        type: 'chat_delta',
        agentId: event.agentId,
        agentName: event.agentName,
        streamKey: `${event.agentId}:${operationId}`,
        delta: (rest as any).delta,
        operationId,
      });
      break;
      
    case 'agent_message_end':
      onUpdate({
        type: 'chat_end',
        agentId: event.agentId,
        agentName: event.agentName,
        streamKey: `${event.agentId}:${operationId}`,
        finalMessage: (rest as any).finalMessage,
        operationId,
      });
      break;
      
    case 'task_started':
      onUpdate({
        type: 'task_started',
        agentId: event.agentId,
        agentName: event.agentName,
        streamKey: `${event.agentId}:${operationId}`,
        tool: (rest as any).tool,
        params: (rest as any).params,
        operationId,
      });
      break;
      
    case 'task_progress':
      onUpdate({
        type: 'task_progress',
        agentId: event.agentId,
        agentName: event.agentName,
        streamKey: `${event.agentId}:${operationId}`,
        progress: (rest as any).progress,
        message: (rest as any).message,
        operationId,
      });
      break;
      
    case 'tool_started':
      onUpdate({
        type: 'tool_started',
        agentId: event.agentId,
        agentName: event.agentName,
        streamKey: `${event.agentId}:${operationId}`,
        toolName: (rest as any).toolName,
        operationId,
      });
      break;
      
    case 'tool_stdout':
      onUpdate({
        type: 'tool_stdout',
        agentId: event.agentId,
        agentName: event.agentName,
        streamKey: `${event.agentId}:${operationId}`,
        data: (rest as any).data,
        operationId,
      });
      break;
      
    case 'tool_stderr':
      onUpdate({
        type: 'tool_stderr',
        agentId: event.agentId,
        agentName: event.agentName,
        streamKey: `${event.agentId}:${operationId}`,
        data: (rest as any).data,
        operationId,
      });
      break;
      
    case 'tool_finished':
      onUpdate({
        type: 'tool_finished',
        agentId: event.agentId,
        agentName: event.agentName,
        streamKey: `${event.agentId}:${operationId}`,
        result: (rest as any).result,
        operationId,
      });
      break;
      
    case 'task_completed':
      onUpdate({
        type: 'task_completed',
        agentId: event.agentId,
        agentName: event.agentName,
        streamKey: `${event.agentId}:${operationId}`,
        result: (rest as any).result,
        operationId,
      });
      break;
      
    case 'task_failed':
      onUpdate({
        type: 'task_failed',
        agentId: event.agentId,
        agentName: event.agentName,
        streamKey: `${event.agentId}:${operationId}`,
        error: (rest as any).error,
        operationId,
      });
      break;
      
    case 'task_cancelled':
      onUpdate({
        type: 'task_cancelled',
        agentId: event.agentId,
        agentName: event.agentName,
        streamKey: `${event.agentId}:${operationId}`,
        operationId,
      });
      break;
  }
}

/**
 * Subscribe to worker events via gRPC and handle streaming display
 */
export async function withGrpcWorkerStreaming(
  options: GrpcStreamingOptions,
  operation: () => Promise<any>
): Promise<GrpcStreamingResult> {
  const { agentId, agentName, operationId, operationType, onUpdate, signal } = options;
  
  const events: StreamEvent[] = [];
  const streamingManager = getGrpcStreamingManager();
  
  // Event handler that filters by operationId
  const eventHandler = (event: StreamEvent) => {
    // Filter events by operationId (from parentOperationId)
    const eventOpId = (event as any).parentOperationId;
    if (eventOpId !== operationId) {
      return;
    }
    
    // Add agent info to event for display
    const eventWithAgentInfo = {
      ...event,
      agentId,
      agentName,
    };
    
    events.push(eventWithAgentInfo);
    handleEvent(eventWithAgentInfo, onUpdate, operationId);
  };
  
  // Subscribe to agent via gRPC
  const client = streamingManager.subscribeToAgent(agentId, agentName, eventHandler);
  
  // Set up abort signal
  const abortHandler = () => {
    streamingManager.unsubscribeFromAgent(agentId, eventHandler);
  };
  
  if (signal) {
    signal.addEventListener('abort', abortHandler);
  }
  
  try {
    // Execute the operation that triggers gRPC streaming
    const finalResult = await operation();

    const isTerminalEvent = (event: StreamEvent) => {
      if (operationType === 'chat') {
        return event.type === 'agent_message_end';
      }
      return event.type === 'task_completed' || event.type === 'task_failed' || event.type === 'task_cancelled';
    };

    const alreadyTerminal = events.some(isTerminalEvent);
    if (!alreadyTerminal) {
      const waitUntil = Date.now() + (operationType === 'chat' ? 30000 : 120000);
      while (Date.now() < waitUntil) {
        if (signal?.aborted) {
          break;
        }
        if (events.some(isTerminalEvent)) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return { finalResult, events };
    
  } finally {
    // Clean up
    if (signal) {
      signal.removeEventListener('abort', abortHandler);
    }
    streamingManager.unsubscribeFromAgent(agentId, eventHandler);
  }
}

/**
 * Connect gRPC streaming manager to GrpcServer frame events
 * This should be called by the master agent-server
 */
export function connectGrpcStreamingToServer(onFrameCallback: (frame: any) => void): () => void {
  const streamingManager = getGrpcStreamingManager();
  
  // Create wrapper that forwards frames to streaming manager
  const frameHandler = (frame: any) => {
    streamingManager.handleGrpcFrame(frame);
  };
  
  // Return cleanup function
  return () => {
    streamingManager.cleanup();
  };
}