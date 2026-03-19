/**
 * Streaming Events System
 * 
 * Provides real-time event streaming from workers to master.
 * Uses Server-Sent Events (SSE) for simple HTTP-based streaming.
 */

import { log } from './logger.js';

export type StreamEvent = 
  | { type: 'agent_message_start', turnId: string, persona?: { name: string, role: string }, parentOperationId?: string, parentOperationType?: 'chat' }
  | { type: 'agent_message_delta', turnId: string, delta: string, parentOperationId?: string, parentOperationType?: 'chat' }
  | { type: 'agent_message_end', turnId: string, finalMessage: string, parentOperationId?: string, parentOperationType?: 'chat' }
  | { type: 'task_started', taskId: string, tool: string, params: any, parentOperationId?: string, parentOperationType?: 'task' }
  | { type: 'task_progress', taskId: string, progress: number, message?: string, parentOperationId?: string, parentOperationType?: 'task' }
  | { type: 'tool_started', taskId: string, toolName: string, params: any, parentOperationId?: string, parentOperationType?: 'task' | 'chat' }
  | { type: 'tool_stdout', taskId: string, data: string, parentOperationId?: string, parentOperationType?: 'task' | 'chat' }
  | { type: 'tool_stderr', taskId: string, data: string, parentOperationId?: string, parentOperationType?: 'task' | 'chat' }
  | { type: 'tool_finished', taskId: string, result: any, parentOperationId?: string, parentOperationType?: 'task' | 'chat' }
  | { type: 'task_completed', taskId: string, result: any, parentOperationId?: string, parentOperationType?: 'task' }
  | { type: 'task_failed', taskId: string, error: string, parentOperationId?: string, parentOperationType?: 'task' }
  | { type: 'task_cancelled', taskId: string, parentOperationId?: string, parentOperationType?: 'task' }
  | { type: 'heartbeat', agentId: string, timestamp: number };

export class EventStream {
  private clients = new Map<string, (event: StreamEvent) => void>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  
  constructor(private agentId: string) {
    // Start heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.broadcast({
        type: 'heartbeat',
        agentId: this.agentId,
        timestamp: Date.now(),
      });
    }, 30000); // 30 second heartbeat
  }
  
  /**
   * Register a client callback for events
   */
  subscribe(clientId: string, callback: (event: StreamEvent) => void): void {
    this.clients.set(clientId, callback);
    log.debug(`Client ${clientId} subscribed to event stream`);
  }
  
  /**
   * Unregister a client
   */
  unsubscribe(clientId: string): void {
    this.clients.delete(clientId);
    log.debug(`Client ${clientId} unsubscribed from event stream`);
  }
  
  /**
   * Broadcast event to all clients
   */
  broadcast(event: StreamEvent): void {
    for (const [clientId, callback] of this.clients.entries()) {
      try {
        callback(event);
      } catch (error) {
        log.error(`Error sending event to client ${clientId}:`, error);
        this.clients.delete(clientId);
      }
    }
  }
  
  /**
   * Send agent message start
   */
  sendMessageStart(turnId: string, persona?: { name: string, role: string }): void {
    this.broadcast({
      type: 'agent_message_start',
      turnId,
      persona,
      parentOperationId: turnId,
      parentOperationType: 'chat',
    });
  }
  
  /**
   * Send agent message delta (streaming text)
   */
  sendMessageDelta(turnId: string, delta: string): void {
    this.broadcast({
      type: 'agent_message_delta',
      turnId,
      delta,
      parentOperationId: turnId,
      parentOperationType: 'chat',
    });
  }
  
  /**
   * Send agent message end
   */
  sendMessageEnd(turnId: string, finalMessage: string): void {
    this.broadcast({
      type: 'agent_message_end',
      turnId,
      finalMessage,
      parentOperationId: turnId,
      parentOperationType: 'chat',
    });
  }
  
  /**
   * Send task started event
   */
  sendTaskStarted(taskId: string, tool: string, params: any): void {
    this.broadcast({
      type: 'task_started',
      taskId,
      tool,
      params,
      parentOperationId: taskId,
      parentOperationType: 'task',
    });
  }
  
  /**
   * Send task progress
   */
  sendTaskProgress(taskId: string, progress: number, message?: string): void {
    this.broadcast({
      type: 'task_progress',
      taskId,
      progress,
      message,
      parentOperationId: taskId,
      parentOperationType: 'task',
    });
  }
  
  /**
   * Send tool started event
   */
  sendToolStarted(taskId: string, toolName: string, params: any, parentOperationType: 'task' | 'chat' = 'task'): void {
    this.broadcast({
      type: 'tool_started',
      taskId,
      toolName,
      params,
      parentOperationId: taskId,
      parentOperationType,
    });
  }
  
  /**
   * Send tool stdout
   */
  sendToolStdout(taskId: string, data: string, parentOperationType: 'task' | 'chat' = 'task'): void {
    this.broadcast({
      type: 'tool_stdout',
      taskId,
      data,
      parentOperationId: taskId,
      parentOperationType,
    });
  }
  
  /**
   * Send tool stderr
   */
  sendToolStderr(taskId: string, data: string, parentOperationType: 'task' | 'chat' = 'task'): void {
    this.broadcast({
      type: 'tool_stderr',
      taskId,
      data,
      parentOperationId: taskId,
      parentOperationType,
    });
  }
  
  /**
   * Send tool finished
   */
  sendToolFinished(taskId: string, result: any, parentOperationType: 'task' | 'chat' = 'task'): void {
    this.broadcast({
      type: 'tool_finished',
      taskId,
      result,
      parentOperationId: taskId,
      parentOperationType,
    });
  }
  
  /**
   * Send task completed
   */
  sendTaskCompleted(taskId: string, result: any): void {
    this.broadcast({
      type: 'task_completed',
      taskId,
      result,
      parentOperationId: taskId,
      parentOperationType: 'task',
    });
  }
  
  /**
   * Send task failed
   */
  sendTaskFailed(taskId: string, error: string): void {
    this.broadcast({
      type: 'task_failed',
      taskId,
      error,
      parentOperationId: taskId,
      parentOperationType: 'task',
    });
  }
  
  /**
   * Send task cancelled
   */
  sendTaskCancelled(taskId: string): void {
    this.broadcast({
      type: 'task_cancelled',
      taskId,
      parentOperationId: taskId,
      parentOperationType: 'task',
    });
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.clients.clear();
  }
}

/**
 * Create SSE response handler for HTTP streaming
 */
export function createSSEHandler(eventStream: EventStream) {
  return (req: any, res: any) => {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    
    // Send initial connection event
    res.write('event: connected\ndata: {}\n\n');
    
    // Create client ID
    const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    // Create callback for this client
    const callback = (event: StreamEvent) => {
      try {
        const eventData = JSON.stringify(event);
        res.write(`data: ${eventData}\n\n`);
      } catch (error) {
        log.error('Error sending SSE event:', error);
      }
    };
    
    // Subscribe to events
    eventStream.subscribe(clientId, callback);
    
    // Handle client disconnect
    req.on('close', () => {
      eventStream.unsubscribe(clientId);
      res.end();
    });
    
    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 15000);
    
    // Clean up on response end
    res.on('close', () => {
      clearInterval(keepAlive);
      eventStream.unsubscribe(clientId);
    });
  };
}