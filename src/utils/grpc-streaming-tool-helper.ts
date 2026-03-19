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
        agentName: event.agentName,
        persona: (rest as any).persona,
        operationId,
      });
      break;
      
    case 'agent_message_delta':
      onUpdate({
        type: 'chat_delta',
        agentName: event.agentName,
        delta: (rest as any).delta,
        operationId,
      });
      break;
      
    case 'agent_message_end':
      onUpdate({
        type: 'chat_end',
        agentName: event.agentName,
        finalMessage: (rest as any).finalMessage,
        operationId,
      });
      break;
      
    case 'task_started':
      onUpdate({
        type: 'task_started',
        agentName: event.agentName,
        tool: (rest as any).tool,
        params: (rest as any).params,
        operationId,
      });
      break;
      
    case 'task_progress':
      onUpdate({
        type: 'task_progress',
        agentName: event.agentName,
        progress: (rest as any).progress,
        message: (rest as any).message,
        operationId,
      });
      break;
      
    case 'tool_started':
      onUpdate({
        type: 'tool_started',
        agentName: event.agentName,
        toolName: (rest as any).toolName,
        operationId,
      });
      break;
      
    case 'tool_stdout':
      onUpdate({
        type: 'tool_stdout',
        agentName: event.agentName,
        data: (rest as any).data,
        operationId,
      });
      break;
      
    case 'tool_stderr':
      onUpdate({
        type: 'tool_stderr',
        agentName: event.agentName,
        data: (rest as any).data,
        operationId,
      });
      break;
      
    case 'tool_finished':
      onUpdate({
        type: 'tool_finished',
        agentName: event.agentName,
        result: (rest as any).result,
        operationId,
      });
      break;
      
    case 'task_completed':
      onUpdate({
        type: 'task_completed',
        agentName: event.agentName,
        result: (rest as any).result,
        operationId,
      });
      break;
      
    case 'task_failed':
      onUpdate({
        type: 'task_failed',
        agentName: event.agentName,
        error: (rest as any).error,
        operationId,
      });
      break;
      
    case 'task_cancelled':
      onUpdate({
        type: 'task_cancelled',
        agentName: event.agentName,
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
    // Execute the operation (HTTP request that triggers gRPC streaming)
    const finalResult = await operation();
    
    // Wait a bit for any final events to come through
    await new Promise(resolve => setTimeout(resolve, 100));
    
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