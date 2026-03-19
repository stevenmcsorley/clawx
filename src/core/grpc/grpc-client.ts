/**
 * gRPC Client for Clawx Agent Communication
 * 
 * Replaces WebSocket client and SSE streaming with gRPC bidirectional streaming
 */

import * as grpc from '@grpc/grpc-js';
import { EventEmitter } from 'events';
import { log } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import type { Persona } from '../../types/persona.js';
import { GrpcAgentFrame, GrpcFrames, type GrpcFrameType } from './protocol.js';

export interface GrpcClientOptions {
  agentId: string;
  agentName: string;
  persona?: Persona;
  capabilities: string[];
  endpoint: string;
  serverAddress: string; // grpc://localhost:port
  reconnectDelay?: number;
  heartbeatInterval?: number;
  onFrame?: (frame: GrpcAgentFrame) => void;
  onRegistered?: (agentId: string) => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
}

export class GrpcClient extends EventEmitter {
  private client: grpc.Client;
  private call: grpc.ClientDuplexStream<any, any> | null = null;
  private connected = false;
  private registered = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pendingFrames: GrpcAgentFrame[] = [];
  
  constructor(private options: GrpcClientOptions) {
    super();
    
    // Parse server address (remove grpc:// prefix if present)
    const address = options.serverAddress.replace(/^grpc:\/\//, '');
    this.client = new grpc.Client(
      address,
      grpc.credentials.createInsecure()
    );
    
    this.connect();
  }
  
  private connect() {
    try {
      log.info(`[gRPC Client] ${this.options.agentId} connecting to ${this.options.serverAddress}...`);
      
      this.call = this.client.makeBidiStreamRequest(
        '/ClawxAgentService/Connect',
        (frame: any) => Buffer.from(JSON.stringify(frame)),
        (data: any) => {
          if (data instanceof Buffer) return JSON.parse(data.toString());
          return data;
        },
        new grpc.Metadata(),
        { deadline: Date.now() + 10000 }
      );
      
      if (!this.call) {
        throw new Error('Failed to create gRPC stream');
      }
      
      this.setupCallHandlers();
      this.connected = true;
      this.emit('connected');
      
      // Register with server
      this.register();
      
    } catch (error) {
      this.handleError(error as Error);
    }
  }
  
  private setupCallHandlers() {
    if (!this.call) return;
    
    this.call.on('data', (data: any) => {
      try {
        const frame = data instanceof Buffer ? JSON.parse(data.toString()) : data;
        this.handleFrame(frame as GrpcAgentFrame);
      } catch (error) {
        log.error('[gRPC Client] Failed to parse frame:', error);
      }
    });
    
    this.call.on('error', (error: Error) => {
      this.handleError(error);
    });
    
    this.call.on('end', () => {
      this.handleDisconnect();
    });
  }
  
  private handleFrame(frame: GrpcAgentFrame) {
    log.debug(`[gRPC Client] ${this.options.agentId} received ${frame.type} from ${frame.fromAgentId}`);
    
    // External handler
    this.options.onFrame?.(frame);
    this.emit('frame', frame);
    
    switch (frame.type) {
      case 'registered':
        this.handleRegistered(frame);
        break;
        
      case 'chat_message':
        this.emit('chat', {
          from: frame.fromAgentId,
          message: frame.payload?.message,
          timestamp: frame.timestamp,
          conversationId: frame.parentOperationId,
        });
        break;
        
      case 'agent_message_start':
      case 'agent_message_delta':
      case 'agent_message_end':
        this.emit('agentMessage', frame);
        break;
        
      case 'task_started':
      case 'task_progress':
      case 'tool_started':
      case 'tool_stdout':
      case 'tool_stderr':
      case 'tool_finished':
      case 'task_completed':
      case 'task_failed':
        this.emit('taskEvent', frame);
        break;
        
      case 'system':
        log.debug(`[gRPC Client] System message: ${frame.payload?.message}`);
        break;
        
      case 'error':
        log.error(`[gRPC Client] Error from server: ${frame.error}`);
        this.emit('error', new Error(frame.error || 'Unknown error'));
        break;
        
      case 'heartbeat':
        // Acknowledge heartbeat
        break;
        
      default:
        log.warn(`[gRPC Client] Unknown frame type: ${frame.type}`);
    }
  }
  
  private handleRegistered(frame: GrpcAgentFrame) {
    const payload = frame.payload;
    if (payload?.status === 'registered') {
      this.registered = true;
      log.info(`[gRPC Client] ${this.options.agentId} registered successfully`);
      
      this.options.onRegistered?.(this.options.agentId);
      this.emit('registered', this.options.agentId);
      
      this.startHeartbeat();
      
      // Send any pending frames
      this.flushPendingFrames();
    } else {
      log.error(`[gRPC Client] Registration rejected: ${payload?.message}`);
      this.emit('error', new Error(`Registration rejected: ${payload?.message}`));
    }
  }
  
  private register() {
    const frame = GrpcFrames.createRegister(
      this.options.agentId,
      this.options.agentName,
      this.options.endpoint,
      this.options.persona,
      this.options.capabilities
    );
    
    this.sendFrame(frame);
  }
  
  private startHeartbeat() {
    const interval = this.options.heartbeatInterval || 30000;
    
    this.heartbeatTimer = setInterval(() => {
      if (this.connected && this.registered) {
        this.sendHeartbeat();
      }
    }, interval);
  }
  
  private sendHeartbeat() {
    const frame = GrpcFrames.createHeartbeat(this.options.agentId);
    this.sendFrame(frame);
  }
  
  private handleError(error: Error) {
    log.error(`[gRPC Client] ${this.options.agentId} error:`, error.message);
    this.options.onError?.(error);
    this.emit('error', error);
    this.handleDisconnect();
  }
  
  private handleDisconnect() {
    if (!this.connected) return;
    
    this.connected = false;
    this.registered = false;
    this.call = null;
    
    this.stopHeartbeat();
    
    this.options.onDisconnected?.();
    this.emit('disconnected');
    
    // Schedule reconnection
    this.scheduleReconnect();
  }
  
  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    const delay = this.options.reconnectDelay || 5000;
    this.reconnectTimer = setTimeout(() => {
      log.info(`[gRPC Client] ${this.options.agentId} attempting reconnect...`);
      this.connect();
    }, delay);
  }
  
  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  
  private flushPendingFrames() {
    while (this.pendingFrames.length > 0) {
      const frame = this.pendingFrames.shift();
      if (frame) {
        this.sendFrame(frame);
      }
    }
  }
  
  // Public API
  
  sendFrame(frame: GrpcAgentFrame): boolean {
    if (!this.connected || !this.call) {
      log.warn(`[gRPC Client] ${this.options.agentId} not connected, queuing frame`);
      this.pendingFrames.push(frame);
      return false;
    }
    
    if (!this.registered && frame.type !== 'register') {
      log.warn(`[gRPC Client] ${this.options.agentId} not registered, queuing frame`);
      this.pendingFrames.push(frame);
      return false;
    }
    
    try {
      this.call.write(frame);
      return true;
    } catch (error) {
      log.error(`[gRPC Client] ${this.options.agentId} failed to send frame:`, error);
      return false;
    }
  }
  
  sendChat(toAgentId: string, message: string, conversationId?: string): boolean {
    const frame = GrpcFrames.createChatMessage(
      this.options.agentId,
      toAgentId,
      message,
      conversationId
    );
    return this.sendFrame(frame);
  }
  
  sendAgentMessageStart(turnId: string, toAgentId: string, persona?: { name: string; role: string }): boolean {
    const frame = GrpcFrames.createAgentMessageStart(
      turnId,
      this.options.agentId,
      toAgentId,
      persona
    );
    return this.sendFrame(frame);
  }
  
  sendAgentMessageDelta(turnId: string, toAgentId: string, delta: string): boolean {
    const frame = GrpcFrames.createAgentMessageDelta(
      turnId,
      this.options.agentId,
      toAgentId,
      delta
    );
    return this.sendFrame(frame);
  }
  
  sendAgentMessageEnd(turnId: string, toAgentId: string, finalMessage: string): boolean {
    const frame = GrpcFrames.createAgentMessageEnd(
      turnId,
      this.options.agentId,
      toAgentId,
      finalMessage
    );
    return this.sendFrame(frame);
  }
  
  sendTaskStarted(taskId: string, toAgentId: string, tool: string, params: any): boolean {
    const frame = GrpcFrames.createTaskStarted(
      taskId,
      this.options.agentId,
      toAgentId,
      tool,
      params
    );
    return this.sendFrame(frame);
  }
  
  sendTaskProgress(taskId: string, toAgentId: string, progress: number, message?: string): boolean {
    const frame = GrpcFrames.createTaskProgress(
      taskId,
      this.options.agentId,
      toAgentId,
      progress,
      message
    );
    return this.sendFrame(frame);
  }
  
  sendToolStarted(taskId: string, toAgentId: string, toolName: string, params: any, parentOperationType: 'task' | 'chat' = 'task'): boolean {
    const frame = GrpcFrames.createToolStarted(
      taskId,
      this.options.agentId,
      toAgentId,
      toolName,
      params,
      parentOperationType
    );
    return this.sendFrame(frame);
  }
  
  sendToolStdout(taskId: string, toAgentId: string, data: string, parentOperationType: 'task' | 'chat' = 'task'): boolean {
    const frame = GrpcFrames.createToolStdout(
      taskId,
      this.options.agentId,
      toAgentId,
      data,
      parentOperationType
    );
    return this.sendFrame(frame);
  }
  
  sendToolStderr(taskId: string, toAgentId: string, data: string, parentOperationType: 'task' | 'chat' = 'task'): boolean {
    const frame = GrpcFrames.createToolStderr(
      taskId,
      this.options.agentId,
      toAgentId,
      data,
      parentOperationType
    );
    return this.sendFrame(frame);
  }
  
  sendToolFinished(taskId: string, toAgentId: string, result: any, parentOperationType: 'task' | 'chat' = 'task'): boolean {
    const frame = GrpcFrames.createToolFinished(
      taskId,
      this.options.agentId,
      toAgentId,
      result,
      parentOperationType
    );
    return this.sendFrame(frame);
  }
  
  sendTaskCompleted(taskId: string, toAgentId: string, result: any): boolean {
    const frame = GrpcFrames.createTaskCompleted(
      taskId,
      this.options.agentId,
      toAgentId,
      result
    );
    return this.sendFrame(frame);
  }
  
  sendTaskFailed(taskId: string, toAgentId: string, error: string): boolean {
    const frame = GrpcFrames.createTaskFailed(
      taskId,
      this.options.agentId,
      toAgentId,
      error
    );
    return this.sendFrame(frame);
  }
  
  disconnect() {
    this.connected = false;
    this.registered = false;
    
    this.stopHeartbeat();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.call) {
      this.call.end();
      this.call = null;
    }
    
    this.client.close();
    
    log.info(`[gRPC Client] ${this.options.agentId} disconnected`);
    this.emit('disconnected');
  }
  
  isConnected(): boolean {
    return this.connected;
  }
  
  isRegistered(): boolean {
    return this.registered;
  }
  
  getAgentId(): string {
    return this.options.agentId;
  }
  
  getAgentName(): string {
    return this.options.agentName;
  }
  
  getPersona(): Persona | undefined {
    return this.options.persona;
  }
}