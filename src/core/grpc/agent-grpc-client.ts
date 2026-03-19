/**
 * Agent gRPC Client for Clawx
 * 
 * Client for agents to connect to the gRPC server
 */

import * as grpc from '@grpc/grpc-js';
import { EventEmitter } from 'events';
import { log } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import type { Persona } from '../../types/persona.js';
import type { GrpcAgentMessage } from './agent-grpc-server.js';

export interface GrpcClientOptions {
  agentId: string;
  agentName?: string;
  persona?: Persona;
  serverAddress: string;
  reconnectDelay?: number;
  heartbeatInterval?: number;
}

export class AgentGrpcClient extends EventEmitter {
  private client: grpc.Client;
  private call: any = null;
  private connected = false;
  private registered = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  constructor(private options: GrpcClientOptions) {
    super();
    this.client = new grpc.Client(
      options.serverAddress,
      grpc.credentials.createInsecure()
    );
    this.connect();
  }
  
  private connect() {
    try {
      log.info(`[gRPC Client] ${this.options.agentId} connecting to ${this.options.serverAddress}...`);
      
      this.call = this.client.makeBidiStreamRequest(
        '/AgentService/Connect',
        (msg: any) => Buffer.from(JSON.stringify(msg)),
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
        const msg = data instanceof Buffer ? JSON.parse(data.toString()) : data;
        this.handleMessage(msg as GrpcAgentMessage);
      } catch (error) {
        log.error('[gRPC Client] Failed to parse message:', error);
      }
    });
    
    this.call.on('error', (error: Error) => {
      this.handleError(error);
    });
    
    this.call.on('end', () => {
      this.handleDisconnect();
    });
  }
  
  private handleMessage(msg: GrpcAgentMessage) {
    this.emit('message', msg);
    
    switch (msg.type) {
      case 'system':
        this.handleSystemMessage(msg);
        break;
        
      case 'chat':
        this.emit('chat', {
          from: msg.from,
          message: msg.content,
          timestamp: msg.timestamp,
        });
        break;
        
      case 'error':
        this.emit('error', new Error(`Server error: ${msg.content}`));
        break;
    }
  }
  
  private handleSystemMessage(msg: GrpcAgentMessage) {
    try {
      const data = JSON.parse(msg.content);
      if (data.status === 'registered') {
        this.registered = true;
        this.emit('registered', this.options.agentId);
        this.startHeartbeat();
        log.info(`[gRPC Client] ${this.options.agentId} registered successfully`);
      }
    } catch (error) {
      // Not a JSON message, just log it
      log.debug(`[gRPC Client] System message: ${msg.content}`);
    }
  }
  
  private register() {
    const msg: GrpcAgentMessage = {
      id: uuidv4(),
      type: 'register',
      from: this.options.agentId,
      to: 'server',
      content: JSON.stringify({
        agentId: this.options.agentId,
        agentName: this.options.agentName || this.options.agentId,
        persona: this.options.persona,
        timestamp: Date.now(),
      }),
      timestamp: Date.now(),
    };
    
    this.send(msg);
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
    const msg: GrpcAgentMessage = {
      id: uuidv4(),
      type: 'heartbeat',
      from: this.options.agentId,
      to: 'server',
      content: '',
      timestamp: Date.now(),
    };
    
    this.send(msg);
  }
  
  private handleError(error: Error) {
    log.error(`[gRPC Client] ${this.options.agentId} error:`, error.message);
    this.emit('error', error);
    this.handleDisconnect();
  }
  
  private handleDisconnect() {
    if (!this.connected) return;
    
    this.connected = false;
    this.registered = false;
    this.call = null;
    
    this.stopHeartbeat();
    
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
  
  // Public API
  
  send(msg: GrpcAgentMessage): boolean {
    if (!this.connected || !this.call) {
      log.warn(`[gRPC Client] ${this.options.agentId} not connected, cannot send`);
      return false;
    }
    
    try {
      this.call.write(msg);
      return true;
    } catch (error) {
      log.error(`[gRPC Client] ${this.options.agentId} failed to send:`, error);
      return false;
    }
  }
  
  sendChat(toAgent: string, message: string): boolean {
    const msg: GrpcAgentMessage = {
      id: uuidv4(),
      type: 'chat',
      from: this.options.agentId,
      to: toAgent,
      content: message,
      timestamp: Date.now(),
    };
    
    return this.send(msg);
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
    return this.options.agentName || this.options.agentId;
  }
  
  getPersona(): Persona | undefined {
    return this.options.persona;
  }
}