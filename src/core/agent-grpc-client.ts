/**
 * Agent gRPC Client
 * 
 * gRPC client for agents to connect to the gRPC server
 * Replaces WebSocket client with gRPC bidirectional streaming
 */

import * as grpc from '@grpc/grpc-js';
import { EventEmitter } from 'events';
import { log } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import type { Persona } from '../types/persona.js';
import type { GrpcMessage } from './agent-grpc.js';

export interface GrpcClientOptions {
  agentId: string;
  agentName?: string;
  persona?: Persona;
  serverAddress: string; // e.g., 'localhost:50051'
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

export interface GrpcClientCallbacks {
  onMessage: (message: GrpcMessage) => void;
  onError: (error: Error) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onRegistered: (agentId: string) => void;
}

export class AgentGrpcClient extends EventEmitter {
  private client: any;
  private call: any | null = null;
  private isConnected = false;
  private isRegistered = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  
  constructor(
    private options: GrpcClientOptions,
    private callbacks: GrpcClientCallbacks
  ) {
    super();
    this.connect();
  }

  private connect() {
    log.info(`Agent ${this.options.agentId} connecting to gRPC server at ${this.options.serverAddress}...`);
    
    // Create gRPC client
    this.client = new grpc.Client(
      this.options.serverAddress,
      grpc.credentials.createInsecure()
    );
    
    // Make bidirectional streaming call
    const deadline = new Date();
    deadline.setSeconds(deadline.getSeconds() + 10); // 10 second deadline
    
    this.call = this.client.makeBidiStreamRequest(
      '/agentlink.AgentLink/Connect',
      (value: GrpcMessage) => Buffer.from(JSON.stringify(value)),
      (buffer: Buffer) => JSON.parse(buffer.toString()),
      {},
      deadline
    );
    
    if (!this.call) {
      this.handleConnectionError(new Error('Failed to create gRPC call'));
      return;
    }
    
    // Set up stream handlers
    this.call.on('data', (message: GrpcMessage) => {
      this.handleIncomingMessage(message);
    });
    
    this.call.on('error', (error: Error) => {
      this.handleStreamError(error);
    });
    
    this.call.on('end', () => {
      this.handleStreamEnd();
    });
    
    // Connection established
    this.handleConnectionEstablished();
  }

  private handleConnectionEstablished() {
    log.info(`Agent ${this.options.agentId} connected to gRPC server`);
    
    this.isConnected = true;
    this.reconnectAttempts = 0;
    
    // Clear any reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Start heartbeat
    this.startHeartbeat();
    
    // Send registration
    this.sendRegistration();
    
    // Notify callbacks
    this.callbacks.onConnected();
    this.emit('connected');
  }

  private handleConnectionError(error: Error) {
    log.error(`Agent ${this.options.agentId} connection error:`, error);
    
    this.isConnected = false;
    this.isRegistered = false;
    
    // Stop heartbeat
    this.stopHeartbeat();
    
    // Notify callbacks
    this.callbacks.onError(error);
    this.emit('error', error);
    
    // Attempt reconnection
    this.attemptReconnect();
  }

  private handleIncomingMessage(message: GrpcMessage) {
    message.receivedAt = Date.now();
    
    // Handle welcome message
    if (message.type === 'welcome') {
      log.debug(`Agent ${this.options.agentId} received welcome from server`);
      return;
    }
    
    // Handle registration confirmation
    if (message.type === 'registration_confirmed') {
      try {
        const data = JSON.parse(message.content);
        if (data.agentId === this.options.agentId) {
          this.isRegistered = true;
          log.info(`Agent ${this.options.agentId} registration confirmed`);
          this.callbacks.onRegistered(this.options.agentId);
          this.emit('registered', this.options.agentId);
        }
      } catch (error) {
        log.error('Failed to parse registration confirmation:', error);
      }
      return;
    }
    
    // Handle heartbeat (just ignore, connection is alive)
    if (message.type === 'heartbeat') {
      return;
    }
    
    // Notify callbacks
    this.callbacks.onMessage(message);
    this.emit('message', message);
  }

  private handleStreamError(error: Error) {
    log.error(`Agent ${this.options.agentId} stream error:`, error);
    this.handleConnectionError(error);
  }

  private handleStreamEnd() {
    log.info(`Agent ${this.options.agentId} stream ended`);
    this.handleDisconnection();
  }

  private handleDisconnection() {
    this.isConnected = false;
    this.isRegistered = false;
    this.call = null;
    
    // Stop heartbeat
    this.stopHeartbeat();
    
    // Notify callbacks
    this.callbacks.onDisconnected();
    this.emit('disconnected');
    
    // Attempt reconnection
    this.attemptReconnect();
  }

  private attemptReconnect() {
    const maxAttempts = this.options.maxReconnectAttempts || 10;
    if (this.reconnectAttempts >= maxAttempts) {
      log.error(`Agent ${this.options.agentId} max reconnection attempts reached`);
      return;
    }
    
    this.reconnectAttempts++;
    const delay = (this.options.reconnectDelay || 5000) * Math.min(this.reconnectAttempts, 5);
    
    log.info(`Agent ${this.options.agentId} attempting reconnection in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startHeartbeat() {
    const interval = this.options.heartbeatInterval || 30000; // 30 seconds
    
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, interval);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private sendRegistration() {
    const message: GrpcMessage = {
      conversationId: 'system',
      messageId: uuidv4(),
      fromAgent: this.options.agentId,
      toAgent: 'master',
      fromMaster: '',
      toMaster: '',
      type: 'register',
      seq: 0,
      content: JSON.stringify({
        agentId: this.options.agentId,
        agentName: this.options.agentName || this.options.agentId,
        persona: this.options.persona,
        timestamp: Date.now(),
      }),
      final: true,
      timestamp: Date.now(),
      receivedAt: 0,
      metadata: {},
    };
    
    this.sendMessage(message);
  }

  private sendHeartbeat() {
    const message: GrpcMessage = {
      conversationId: 'system',
      messageId: uuidv4(),
      fromAgent: this.options.agentId,
      toAgent: 'master',
      fromMaster: '',
      toMaster: '',
      type: 'heartbeat',
      seq: 0,
      content: '',
      final: true,
      timestamp: Date.now(),
      receivedAt: 0,
      metadata: {},
    };
    
    this.sendMessage(message);
  }

  sendMessage(message: GrpcMessage): boolean {
    if (!this.isConnected || !this.call) {
      log.error(`Agent ${this.options.agentId} cannot send message: not connected`);
      return false;
    }
    
    try {
      this.call.write(message);
      return true;
    } catch (error) {
      log.error(`Agent ${this.options.agentId} failed to send message:`, error);
      return false;
    }
  }

  sendChatMessage(
    toAgent: string,
    content: string,
    conversationId?: string,
    metadata?: Record<string, string>
  ): boolean {
    const message: GrpcMessage = {
      conversationId: conversationId || `conv_${Date.now()}`,
      messageId: uuidv4(),
      fromAgent: this.options.agentId,
      toAgent,
      fromMaster: '',
      toMaster: '',
      type: 'chat',
      seq: 0,
      content,
      final: true,
      timestamp: Date.now(),
      receivedAt: 0,
      metadata: metadata || {},
    };
    
    return this.sendMessage(message);
  }

  sendToolCall(
    toAgent: string,
    toolName: string,
    params: any,
    conversationId?: string
  ): boolean {
    const message: GrpcMessage = {
      conversationId: conversationId || `tool_${Date.now()}`,
      messageId: uuidv4(),
      fromAgent: this.options.agentId,
      toAgent,
      fromMaster: '',
      toMaster: '',
      type: 'tool_call',
      seq: 0,
      content: JSON.stringify({
        tool: toolName,
        params,
        timestamp: Date.now(),
      }),
      final: true,
      timestamp: Date.now(),
      receivedAt: 0,
      metadata: {},
    };
    
    return this.sendMessage(message);
  }

  sendToolResult(
    toAgent: string,
    callId: string,
    result: any,
    error?: string,
    conversationId?: string
  ): boolean {
    const message: GrpcMessage = {
      conversationId: conversationId || `result_${Date.now()}`,
      messageId: uuidv4(),
      fromAgent: this.options.agentId,
      toAgent,
      fromMaster: '',
      toMaster: '',
      type: 'tool_result',
      seq: 0,
      content: JSON.stringify({
        callId,
        result,
        error,
        timestamp: Date.now(),
      }),
      final: true,
      timestamp: Date.now(),
      receivedAt: 0,
      metadata: {},
    };
    
    return this.sendMessage(message);
  }

  disconnect() {
    this.isConnected = false;
    this.isRegistered = false;
    
    // Stop heartbeat
    this.stopHeartbeat();
    
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // End stream if exists
    if (this.call) {
      this.call.end();
      this.call = null;
    }
    
    // Close client
    if (this.client) {
      this.client.close();
    }
    
    log.info(`Agent ${this.options.agentId} disconnected from gRPC server`);
  }

  isConnectedToServer(): boolean {
    return this.isConnected;
  }

  isAgentRegistered(): boolean {
    return this.isRegistered;
  }

  getAgentId(): string {
    return this.options.agentId;
  }

  getAgentName(): string {
    return this.options.agentName || this.options.agentId;
  }

  getPersona(): Persona | undefined {
    return this.options.persona;
  }
}