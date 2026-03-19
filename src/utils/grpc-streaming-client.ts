/**
 * gRPC Streaming Client for Master
 * 
 * Subscribes to worker event streams via gRPC and forwards events to TUI.
 * Replaces SSE-based StreamingClient.
 */

import { EventEmitter } from 'events';
import { log } from './logger.js';
import type { StreamEvent } from './streaming-events.js';
import type { GrpcAgentFrame } from '../core/grpc/protocol.js';

export interface GrpcStreamClientOptions {
  agentId: string;
  agentName: string;
  onEvent?: (event: StreamEvent) => void;
  // We'll get frames from GrpcServer subscription
}

export class GrpcStreamClient extends EventEmitter {
  private agentId: string;
  private agentName: string;
  private isConnected = false;
  private eventHandlers = new Set<(event: StreamEvent) => void>();
  private unsubscribeCallback: (() => void) | null = null;
  
  constructor(options: GrpcStreamClientOptions) {
    super();
    this.agentId = options.agentId;
    this.agentName = options.agentName;
    
    if (options.onEvent) {
      this.addEventHandler(options.onEvent);
    }
  }
  
  /**
   * Add an event handler
   */
  addEventHandler(handler: (event: StreamEvent) => void): void {
    this.on('event', handler);
    this.eventHandlers.add(handler);
  }
  
  /**
   * Remove an event handler
   */
  removeEventHandler(handler: (event: StreamEvent) => void): void {
    this.off('event', handler);
    this.eventHandlers.delete(handler);
  }
  
  /**
   * Connect to gRPC stream for this agent
   * This should be called by GrpcStreamingManager when subscribing
   */
  connect(unsubscribeCallback: () => void): void {
    this.isConnected = true;
    this.unsubscribeCallback = unsubscribeCallback;
    log.debug(`[gRPC Stream] Connected to agent ${this.agentName} (${this.agentId})`);
  }
  
  /**
   * Disconnect from gRPC stream
   */
  disconnect(): void {
    this.isConnected = false;
    if (this.unsubscribeCallback) {
      this.unsubscribeCallback();
      this.unsubscribeCallback = null;
    }
    log.debug(`[gRPC Stream] Disconnected from agent ${this.agentName} (${this.agentId})`);
  }
  
  /**
   * Handle incoming gRPC frame and convert to StreamEvent
   */
  handleGrpcFrame(frame: GrpcAgentFrame): void {
    if (!this.isConnected) {
      return;
    }
    
    // Convert gRPC frame to StreamEvent
    const event = this.convertGrpcFrameToEvent(frame);
    if (event) {
      this.emit('event', event);
    }
  }
  
  /**
   * Convert gRPC frame to StreamEvent
   */
  private convertGrpcFrameToEvent(frame: GrpcAgentFrame): StreamEvent | null {
    const { type, fromAgentId, toAgentId, parentOperationId, parentOperationType, payload } = frame;
    
    // Only handle frames from our target agent
    if (fromAgentId !== this.agentId) {
      return null;
    }
    
    // Convert based on frame type
    switch (type) {
      case 'agent_message_start':
        return {
          type: 'agent_message_start',
          turnId: parentOperationId || 'unknown',
          persona: payload?.persona,
          parentOperationId,
          parentOperationType: parentOperationType as 'chat',
        };
        
      case 'agent_message_delta':
        return {
          type: 'agent_message_delta',
          turnId: parentOperationId || 'unknown',
          delta: payload?.delta || '',
          parentOperationId,
          parentOperationType: parentOperationType as 'chat',
        };
        
      case 'agent_message_end':
        return {
          type: 'agent_message_end',
          turnId: parentOperationId || 'unknown',
          finalMessage: payload?.finalMessage || '',
          parentOperationId,
          parentOperationType: parentOperationType as 'chat',
        };
        
      case 'task_started':
        return {
          type: 'task_started',
          taskId: parentOperationId || 'unknown',
          tool: payload?.tool,
          params: payload?.params,
          parentOperationId,
          parentOperationType: parentOperationType as 'task',
        };
        
      case 'task_progress':
        return {
          type: 'task_progress',
          taskId: parentOperationId || 'unknown',
          progress: payload?.progress || 0,
          message: payload?.message,
          parentOperationId,
          parentOperationType: parentOperationType as 'task',
        };
        
      case 'tool_started':
        return {
          type: 'tool_started',
          taskId: parentOperationId || 'unknown',
          toolName: payload?.tool,
          params: payload?.params,
          parentOperationId,
          parentOperationType: parentOperationType as 'task' | 'chat',
        };
        
      case 'tool_stdout':
        return {
          type: 'tool_stdout',
          taskId: parentOperationId || 'unknown',
          data: payload?.data || '',
          parentOperationId,
          parentOperationType: parentOperationType as 'task' | 'chat',
        };
        
      case 'tool_stderr':
        return {
          type: 'tool_stderr',
          taskId: parentOperationId || 'unknown',
          data: payload?.data || '',
          parentOperationId,
          parentOperationType: parentOperationType as 'task' | 'chat',
        };
        
      case 'tool_finished':
        return {
          type: 'tool_finished',
          taskId: parentOperationId || 'unknown',
          result: payload?.result,
          parentOperationId,
          parentOperationType: parentOperationType as 'task' | 'chat',
        };
        
      case 'task_completed':
        return {
          type: 'task_completed',
          taskId: parentOperationId || 'unknown',
          result: payload?.result,
          parentOperationId,
          parentOperationType: parentOperationType as 'task',
        };
        
      case 'task_failed':
        return {
          type: 'task_failed',
          taskId: parentOperationId || 'unknown',
          error: payload?.error || 'Unknown error',
          parentOperationId,
          parentOperationType: parentOperationType as 'task',
        };
        
      case 'task_cancelled':
        return {
          type: 'task_cancelled',
          taskId: parentOperationId || 'unknown',
          parentOperationId,
          parentOperationType: parentOperationType as 'task',
        };
        
      default:
        log.debug(`[gRPC Stream] Unhandled frame type: ${type}`);
        return null;
    }
  }
  
  /**
   * Get connection status
   */
  get connected(): boolean {
    return this.isConnected;
  }
}

/**
 * gRPC Streaming Manager
 * 
 * Manages multiple gRPC stream clients and routes frames from GrpcServer
 */
export class GrpcStreamingManager extends EventEmitter {
  private clients = new Map<string, GrpcStreamClient>(); // agentId → client
  private frameHandler: ((frame: GrpcAgentFrame) => void) | null = null;
  
  constructor() {
    super();
  }
  
  /**
   * Subscribe to agent events via gRPC
   */
  subscribeToAgent(agentId: string, agentName: string, onEvent: (event: StreamEvent) => void): GrpcStreamClient {
    let client = this.clients.get(agentId);
    
    if (!client) {
      client = new GrpcStreamClient({
        agentId,
        agentName,
        onEvent,
      });
      
      // Connect client with unsubscribe callback
      client.connect(() => {
        this.clients.delete(agentId);
        log.debug(`[gRPC Stream] Unsubscribed from agent ${agentName} (${agentId})`);
      });
      
      this.clients.set(agentId, client);
      log.debug(`[gRPC Stream] Subscribed to agent ${agentName} (${agentId})`);
    } else {
      // Add event handler to existing client
      client.addEventHandler(onEvent);
    }
    
    return client;
  }
  
  /**
   * Unsubscribe from agent events
   */
  unsubscribeFromAgent(agentId: string, handler?: (event: StreamEvent) => void): void {
    const client = this.clients.get(agentId);
    if (!client) {
      return;
    }
    
    if (handler) {
      client.removeEventHandler(handler);
      // If no more handlers, disconnect
      if (client.listenerCount('event') === 0) {
        client.disconnect();
        this.clients.delete(agentId);
      }
    } else {
      // Remove all handlers and disconnect
      client.disconnect();
      this.clients.delete(agentId);
    }
  }
  
  /**
   * Handle incoming gRPC frame from GrpcServer
   * This should be called by the master's GrpcServer onFrame callback
   */
  handleGrpcFrame(frame: GrpcAgentFrame): void {
    const { fromAgentId } = frame;
    
    // Route frame to appropriate client
    const client = this.clients.get(fromAgentId);
    if (client) {
      client.handleGrpcFrame(frame);
    }
  }
  
  /**
   * Get all connected clients
   */
  getClients(): Map<string, GrpcStreamClient> {
    return new Map(this.clients);
  }
  
  /**
   * Clean up all clients
   */
  cleanup(): void {
    for (const [agentId, client] of this.clients) {
      client.disconnect();
    }
    this.clients.clear();
  }
}