/**
 * Agent gRPC Server for Clawx
 * 
 * Replaces WebSocket server with gRPC for agent-to-agent communication
 */

import * as grpc from '@grpc/grpc-js';
import { EventEmitter } from 'events';
import { log } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import type { Persona } from '../../types/persona.js';

export interface GrpcAgentMessage {
  id: string;
  type: 'chat' | 'tool_call' | 'tool_result' | 'register' | 'heartbeat' | 'system' | 'error';
  from: string;
  to: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface ConnectedAgent {
  id: string;
  name: string;
  call: any;
  persona?: Persona;
  lastSeen: number;
}

export class AgentGrpcServer extends EventEmitter {
  private server: grpc.Server;
  private agents = new Map<string, ConnectedAgent>();
  
  constructor(private port: number) {
    super();
    this.server = new grpc.Server();
    this.setupService();
  }
  
  private setupService() {
    // Serialization helpers
    const serialize = (msg: any): Buffer => {
      return Buffer.from(JSON.stringify(msg));
    };
    
    const deserialize = (data: any): any => {
      if (data instanceof Buffer) {
        return JSON.parse(data.toString());
      }
      return data; // Already parsed by gRPC
    };
    
    // Service implementation
    const service = {
      connect: (call: any) => {
        const connectionId = uuidv4();
        log.info(`[gRPC] New connection: ${connectionId}`);
        
        call.on('data', (data: any) => {
          try {
            const msg = deserialize(data) as GrpcAgentMessage;
            this.handleMessage(msg, call);
          } catch (error) {
            log.error('[gRPC] Failed to parse message:', error);
          }
        });
        
        call.on('error', (error: Error) => {
          log.error(`[gRPC] Connection error:`, error);
          this.removeAgentByCall(call);
        });
        
        call.on('end', () => {
          log.info(`[gRPC] Connection ended: ${connectionId}`);
          this.removeAgentByCall(call);
        });
        
        // Send welcome message
        call.write(serialize({
          id: uuidv4(),
          type: 'system',
          from: 'server',
          to: '',
          content: JSON.stringify({ message: 'Connected to Clawx gRPC server' }),
          timestamp: Date.now(),
        }));
      }
    };
    
    // Service definition
    this.server.addService({
      connect: {
        path: '/AgentService/Connect',
        requestStream: true,
        responseStream: true,
        requestSerialize: serialize,
        requestDeserialize: deserialize,
        responseSerialize: serialize,
        responseDeserialize: deserialize,
      }
    }, service);
  }
  
  private handleMessage(msg: GrpcAgentMessage, call: any) {
    log.debug(`[gRPC] ${msg.type} from ${msg.from}`);
    
    switch (msg.type) {
      case 'register':
        this.handleRegistration(msg, call);
        break;
        
      case 'heartbeat':
        this.updateAgentHeartbeat(msg.from);
        break;
        
      case 'chat':
        this.routeChatMessage(msg);
        break;
        
      case 'tool_call':
      case 'tool_result':
        this.routeMessage(msg);
        break;
        
      default:
        log.warn(`[gRPC] Unknown message type: ${msg.type}`);
    }
  }
  
  private handleRegistration(msg: GrpcAgentMessage, call: any) {
    try {
      const data = JSON.parse(msg.content);
      const agentId = data.agentId || msg.from;
      const agentName = data.agentName || agentId;
      const persona = data.persona;
      
      const agent: ConnectedAgent = {
        id: agentId,
        name: agentName,
        call,
        persona,
        lastSeen: Date.now(),
      };
      
      this.agents.set(agentId, agent);
      log.info(`[gRPC] Agent registered: ${agentId} (${agentName})`);
      
      this.emit('agentRegistered', {
        agentId,
        agentName,
        persona,
      });
      
      // Send confirmation
      this.sendToAgent(agentId, {
        id: uuidv4(),
        type: 'system',
        from: 'server',
        to: agentId,
        content: JSON.stringify({ status: 'registered', agentId }),
        timestamp: Date.now(),
      });
      
    } catch (error) {
      log.error('[gRPC] Registration failed:', error);
    }
  }
  
  private updateAgentHeartbeat(agentId: string) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastSeen = Date.now();
    }
  }
  
  private routeChatMessage(msg: GrpcAgentMessage) {
    if (msg.to === 'broadcast') {
      this.broadcastMessage(msg);
    } else {
      this.sendToAgent(msg.to, msg);
    }
  }
  
  private routeMessage(msg: GrpcAgentMessage) {
    this.sendToAgent(msg.to, msg);
  }
  
  private broadcastMessage(msg: GrpcAgentMessage) {
    let count = 0;
    this.agents.forEach((agent, agentId) => {
      if (agentId !== msg.from) {
        if (this.sendToAgent(agentId, msg)) {
          count++;
        }
      }
    });
    log.debug(`[gRPC] Broadcast from ${msg.from} to ${count} agents`);
  }
  
  private sendToAgent(agentId: string, msg: GrpcAgentMessage): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    
    try {
      agent.call.write(msg);
      return true;
    } catch (error) {
      log.error(`[gRPC] Failed to send to ${agentId}:`, error);
      return false;
    }
  }
  
  private removeAgentByCall(call: any) {
    let agentToRemove: string | null = null;
    this.agents.forEach((agent, agentId) => {
      if (agent.call === call) {
        agentToRemove = agentId;
      }
    });
    
    if (agentToRemove) {
      this.agents.delete(agentToRemove);
      this.emit('agentDisconnected', agentToRemove);
      log.info(`[gRPC] Agent disconnected: ${agentToRemove}`);
    }
  }
  
  // Public API
  
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.bindAsync(
        `127.0.0.1:${this.port}`,
        grpc.ServerCredentials.createInsecure(),
        (error, port) => {
          if (error) {
            reject(error);
            return;
          }
          
          this.server.start();
          log.info(`[gRPC] Server started on port ${port}`);
          resolve();
        }
      );
    });
  }
  
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        log.info('[gRPC] Server stopped');
        resolve();
      });
    });
  }
  
  sendChat(fromAgent: string, toAgent: string, message: string): boolean {
    const msg: GrpcAgentMessage = {
      id: uuidv4(),
      type: 'chat',
      from: fromAgent,
      to: toAgent,
      content: message,
      timestamp: Date.now(),
    };
    
    return this.sendToAgent(toAgent, msg);
  }
  
  broadcast(fromAgent: string, message: string): number {
    const msg: GrpcAgentMessage = {
      id: uuidv4(),
      type: 'chat',
      from: fromAgent,
      to: 'broadcast',
      content: message,
      timestamp: Date.now(),
    };
    
    let count = 0;
    this.agents.forEach((agent, agentId) => {
      if (agentId !== fromAgent) {
        if (this.sendToAgent(agentId, msg)) {
          count++;
        }
      }
    });
    
    return count;
  }
  
  getConnectedAgents(): Array<{id: string; name: string; persona?: Persona}> {
    const agents: Array<{id: string; name: string; persona?: Persona}> = [];
    this.agents.forEach(agent => {
      agents.push({
        id: agent.id,
        name: agent.name,
        persona: agent.persona,
      });
    });
    return agents;
  }
  
  getAgentCount(): number {
    return this.agents.size;
  }
}