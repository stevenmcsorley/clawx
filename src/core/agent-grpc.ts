/**
 * Agent gRPC Server
 * 
 * gRPC server for real-time agent-to-agent communication
 * Replaces the WebSocket server with gRPC bidirectional streaming
 */

import * as grpc from '@grpc/grpc-js';
import { EventEmitter } from 'events';
import { log } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import type { AgentIdentity } from '../types/agent.js';
import type { Persona, ConversationTurn, ChatRequest, ChatResponse } from '../types/persona.js';

export interface GrpcMessage {
  // Routing information
  conversationId: string;
  messageId: string;
  fromAgent: string;
  toAgent: string;
  fromMaster: string;
  toMaster: string;
  
  // Message metadata
  type: string;
  seq: number;
  content: string;
  final: boolean;
  
  // Timestamps
  timestamp: number;
  receivedAt: number;
  
  // Additional metadata
  metadata: Record<string, string>;
}

export interface AgentConnection {
  call: any; // gRPC call object
  agentId: string;
  agentName: string;
  persona?: Persona;
  lastSeen: number;
  stream: any; // Bidirectional stream
}

export class AgentGrpcServer extends EventEmitter {
  private server: grpc.Server;
  private connections: Map<string, AgentConnection> = new Map();
  private messageCallbacks: Map<string, (message: GrpcMessage) => void> = new Map();
  private port: number;
  
  constructor(port: number) {
    super();
    this.port = port;
    
    try {
      log.info(`Creating gRPC server on port ${port}...`);
      this.server = new grpc.Server();
      this.setupServices();
      log.info(`gRPC server created successfully, will bind to port ${port}`);
    } catch (error) {
      log.error(`Failed to create gRPC server on port ${port}:`, error);
      throw error;
    }
  }

  private setupServices() {
    // Define the AgentLink service
    const agentLinkService = {
      // Bidirectional streaming for agent communication
      connect: this.handleAgentConnect.bind(this),
      
      // Health check endpoint
      healthCheck: this.handleHealthCheck.bind(this),
    };

    // Add service to server
    // Note: In a full implementation, we would use generated proto definitions
    // For now, we'll use a dynamic approach
    this.server.addService(this.createServiceDefinition(), agentLinkService);
  }

  private createServiceDefinition(): any {
    // Create a service definition for AgentLink
    return {
      connect: {
        path: '/agentlink.AgentLink/Connect',
        requestStream: true,
        responseStream: true,
        requestSerialize: this.serializeMessage,
        requestDeserialize: this.deserializeMessage,
        responseSerialize: this.serializeMessage,
        responseDeserialize: this.deserializeMessage,
      },
      healthCheck: {
        path: '/agentlink.AgentLink/HealthCheck',
        requestStream: false,
        responseStream: false,
        requestSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        requestDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
        responseSerialize: (value: any) => Buffer.from(JSON.stringify(value)),
        responseDeserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
      }
    };
  }

  private serializeMessage(value: GrpcMessage): Buffer {
    return Buffer.from(JSON.stringify(value));
  }

  private deserializeMessage(buffer: Buffer): GrpcMessage {
    return JSON.parse(buffer.toString());
  }

  private handleAgentConnect(call: any) {
    const connectionId = uuidv4();
    log.info(`New gRPC connection established: ${connectionId}`);
    
    // Set up message handlers
    call.on('data', (message: GrpcMessage) => {
      this.handleIncomingMessage(connectionId, message);
    });
    
    call.on('error', (error: Error) => {
      log.error(`gRPC connection error for ${connectionId}:`, error);
      this.handleDisconnection(connectionId);
    });
    
    call.on('end', () => {
      log.info(`gRPC connection ended: ${connectionId}`);
      this.handleDisconnection(connectionId);
    });
    
    // Store connection
    const connection: AgentConnection = {
      call,
      agentId: '', // Will be set when agent registers
      agentName: '',
      lastSeen: Date.now(),
      stream: call,
    };
    
    this.connections.set(connectionId, connection);
    
    // Send welcome message
    const welcomeMessage: GrpcMessage = {
      conversationId: 'system',
      messageId: uuidv4(),
      fromAgent: 'master',
      toAgent: '',
      fromMaster: 'master',
      toMaster: '',
      type: 'welcome',
      seq: 0,
      content: JSON.stringify({
        message: 'Connected to gRPC agent server',
        connectionId,
        timestamp: Date.now(),
      }),
      final: true,
      timestamp: Date.now(),
      receivedAt: Date.now(),
      metadata: {},
    };
    
    call.write(welcomeMessage);
  }

  private handleHealthCheck(call: any, callback: any) {
    callback(null, {
      status: 1, // SERVING
      uptime: process.uptime(),
      connections: this.connections.size,
    });
  }

  private handleIncomingMessage(connectionId: string, message: GrpcMessage) {
    message.receivedAt = Date.now();
    
    // Update last seen
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastSeen = Date.now();
      
      // Handle registration
      if (message.type === 'register') {
        try {
          const registration = JSON.parse(message.content);
          connection.agentId = registration.agentId;
          connection.agentName = registration.agentName || registration.agentId;
          connection.persona = registration.persona;
          
          log.info(`Agent registered: ${connection.agentId} (${connection.agentName})`);
          
          // Emit registration event
          this.emit('agentRegistered', {
            agentId: connection.agentId,
            agentName: connection.agentName,
            persona: connection.persona,
            connectionId,
          });
          
          // Send registration confirmation
          const confirmMessage: GrpcMessage = {
            conversationId: 'system',
            messageId: uuidv4(),
            fromAgent: 'master',
            toAgent: connection.agentId,
            fromMaster: 'master',
            toMaster: '',
            type: 'registration_confirmed',
            seq: 0,
            content: JSON.stringify({
              message: 'Registration confirmed',
              agentId: connection.agentId,
              timestamp: Date.now(),
            }),
            final: true,
            timestamp: Date.now(),
            receivedAt: Date.now(),
            metadata: {},
          };
          
          connection.call.write(confirmMessage);
          return;
        } catch (error) {
          log.error('Failed to parse registration:', error);
          return;
        }
      }
      
      // Handle heartbeat
      if (message.type === 'heartbeat') {
        // Just update lastSeen, already done above
        return;
      }
      
      // Route the message
      this.routeMessage(message);
    }
  }

  private handleDisconnection(connectionId: string) {
    const connection = this.connections.get(connectionId);
    if (connection && connection.agentId) {
      log.info(`Agent disconnected: ${connection.agentId}`);
      
      // Emit disconnection event
      this.emit('agentDisconnected', {
        agentId: connection.agentId,
        agentName: connection.agentName,
        connectionId,
      });
    }
    
    this.connections.delete(connectionId);
  }

  private routeMessage(message: GrpcMessage) {
    const targetAgent = message.toAgent;
    
    if (!targetAgent || targetAgent === 'broadcast') {
      // Broadcast to all connected agents (except sender)
      this.broadcastMessage(message);
      return;
    }
    
    // Find target connection
    let targetConnection: AgentConnection | undefined;
    
    for (const [_, connection] of this.connections.entries()) {
      if (connection.agentId === targetAgent) {
        targetConnection = connection;
        break;
      }
    }
    
    if (targetConnection) {
      // Send to target agent
      targetConnection.call.write(message);
      
      // Emit message delivered event
      this.emit('messageDelivered', {
        from: message.fromAgent,
        to: targetAgent,
        messageId: message.messageId,
        conversationId: message.conversationId,
      });
    } else {
      // Target not found
      log.warn(`Target agent not found: ${targetAgent}`);
      
      // Send error back to sender
      const errorMessage: GrpcMessage = {
        conversationId: message.conversationId,
        messageId: uuidv4(),
        fromAgent: 'master',
        toAgent: message.fromAgent,
        fromMaster: 'master',
        toMaster: '',
        type: 'error',
        seq: 0,
        content: JSON.stringify({
          code: 'AGENT_NOT_FOUND',
          message: `Target agent ${targetAgent} not found`,
          originalMessageId: message.messageId,
        }),
        final: true,
        timestamp: Date.now(),
        receivedAt: Date.now(),
        metadata: {},
      };
      
      // Find sender connection
      for (const [_, connection] of this.connections.entries()) {
        if (connection.agentId === message.fromAgent) {
          connection.call.write(errorMessage);
          break;
        }
      }
    }
  }

  private broadcastMessage(message: GrpcMessage) {
    // Send to all connected agents except sender
    for (const [_, connection] of this.connections.entries()) {
      if (connection.agentId && connection.agentId !== message.fromAgent) {
        const broadcastMessage = { ...message };
        broadcastMessage.toAgent = connection.agentId;
        connection.call.write(broadcastMessage);
      }
    }
    
    log.debug(`Broadcast message from ${message.fromAgent} to ${this.connections.size - 1} agents`);
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.bindAsync(
        `0.0.0.0:${this.port}`,
        grpc.ServerCredentials.createInsecure(),
        (error, port) => {
          if (error) {
            log.error(`Failed to bind gRPC server to port ${this.port}:`, error);
            reject(error);
            return;
          }
          
          this.server.start();
          log.info(`gRPC server started on port ${port}`);
          resolve();
        }
      );
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        log.info('gRPC server stopped');
        resolve();
      });
    });
  }

  sendMessageToAgent(agentId: string, message: GrpcMessage): boolean {
    for (const [_, connection] of this.connections.entries()) {
      if (connection.agentId === agentId) {
        connection.call.write(message);
        return true;
      }
    }
    return false;
  }

  broadcastToAll(message: GrpcMessage): void {
    for (const [_, connection] of this.connections.entries()) {
      if (connection.agentId) {
        connection.call.write(message);
      }
    }
  }

  getConnectedAgents(): Array<{agentId: string; agentName: string; persona?: Persona}> {
    const agents: Array<{agentId: string; agentName: string; persona?: Persona}> = [];
    
    for (const [_, connection] of this.connections.entries()) {
      if (connection.agentId) {
        agents.push({
          agentId: connection.agentId,
          agentName: connection.agentName,
          persona: connection.persona,
        });
      }
    }
    
    return agents;
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  createChatMessage(
    fromAgent: string,
    toAgent: string,
    content: string,
    conversationId?: string,
    metadata?: Record<string, string>
  ): GrpcMessage {
    return {
      conversationId: conversationId || `conv_${Date.now()}`,
      messageId: uuidv4(),
      fromAgent,
      toAgent,
      fromMaster: 'master',
      toMaster: '',
      type: 'chat',
      seq: 0,
      content,
      final: true,
      timestamp: Date.now(),
      receivedAt: 0,
      metadata: metadata || {},
    };
  }

  createToolCallMessage(
    fromAgent: string,
    toAgent: string,
    toolName: string,
    params: any,
    conversationId?: string
  ): GrpcMessage {
    return {
      conversationId: conversationId || `tool_${Date.now()}`,
      messageId: uuidv4(),
      fromAgent,
      toAgent,
      fromMaster: 'master',
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
  }

  createToolResultMessage(
    fromAgent: string,
    toAgent: string,
    callId: string,
    result: any,
    error?: string,
    conversationId?: string
  ): GrpcMessage {
    return {
      conversationId: conversationId || `result_${Date.now()}`,
      messageId: uuidv4(),
      fromAgent,
      toAgent,
      fromMaster: 'master',
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
  }
}