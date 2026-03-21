/**
 * gRPC Server for Clawx Agent Communication
 * 
 * Replaces WebSocket server and SSE streaming with gRPC bidirectional streaming
 */

import * as grpc from '@grpc/grpc-js';
import { EventEmitter } from 'events';
import { log } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import type { Persona } from '../../types/persona.js';
import type { AgentIdentity } from '../../types/agent.js';
import { GrpcAgentFrame, GrpcFrames, type GrpcFrameType } from './protocol.js';

function sanitizeGrpcPayload<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value, (_key, current) => {
      if (typeof current === 'function') return undefined;
      if (current && typeof current === 'object') {
        const ctor = current.constructor?.name;
        if (ctor === 'GrpcServer' || ctor === 'ServerResponse' || ctor === 'IncomingMessage' || ctor === 'Socket' || ctor === 'TreeNode') {
          return undefined;
        }
      }
      return current;
    }));
  } catch {
    return value;
  }
}

export interface ConnectedAgent {
  id: string;
  name: string;
  call: grpc.ServerDuplexStream<any, any>;
  persona?: Persona;
  capabilities: string[];
  endpoint: string;
  lastSeen: number;
  subscriptions: Map<string, Set<string>>; // operationId -> Set<clientId>
}

export interface GrpcServerOptions {
  port: number;
  onAgentRegistered?: (agent: AgentIdentity) => void;
  onAgentDisconnected?: (agentId: string) => void;
  onFrame?: (frame: GrpcAgentFrame) => void;
}

export class GrpcServer extends EventEmitter {
  private server: grpc.Server;
  private agents = new Map<string, ConnectedAgent>();
  private clients = new Map<string, { agentId: string; call: grpc.ServerDuplexStream<any, any> }>();
  
  constructor(private options: GrpcServerOptions) {
    super();
    this.server = new grpc.Server();
    this.setupService();
  }
  
  private setupService() {
    // Serialization helpers
    const serialize = (frame: GrpcAgentFrame): Buffer => {
      return Buffer.from(JSON.stringify(frame));
    };
    
    const deserialize = (data: any): GrpcAgentFrame => {
      if (data instanceof Buffer) {
        return JSON.parse(data.toString());
      }
      return data; // Already parsed by gRPC
    };
    
    // Service implementation
    const service = {
      connect: (call: grpc.ServerDuplexStream<any, any>) => {
        const clientId = uuidv4();
        log.info(`[gRPC] New client connection: ${clientId}`);
        
        this.clients.set(clientId, { agentId: 'unknown', call });
        
        call.on('data', (data: any) => {
          try {
            const frame = deserialize(data);
            this.handleFrame(frame, call, clientId);
          } catch (error) {
            log.error('[gRPC] Failed to parse frame:', error);
            this.sendError(call, 'Failed to parse frame', clientId);
          }
        });
        
        call.on('error', (error: Error) => {
          log.error(`[gRPC] Client ${clientId} error:`, error);
          this.handleDisconnection(clientId);
        });
        
        call.on('end', () => {
          log.info(`[gRPC] Client ${clientId} connection ended`);
          this.handleDisconnection(clientId);
        });
        
        // Send welcome message
        call.write(serialize(GrpcFrames.createSystemMessage(
          'unknown',
          'Connected to Clawx gRPC server',
          { clientId, serverPort: this.options.port }
        )));
      }
    };
    
    // Service definition
    this.server.addService({
      connect: {
        path: '/ClawxAgentService/Connect',
        requestStream: true,
        responseStream: true,
        requestSerialize: serialize,
        requestDeserialize: deserialize,
        responseSerialize: serialize,
        responseDeserialize: deserialize,
      }
    }, service);
  }
  
  private handleFrame(frame: GrpcAgentFrame, call: grpc.ServerDuplexStream<any, any>, clientId: string) {
    log.debug(`[gRPC] ${frame.type} from ${frame.fromAgentId} to ${frame.toAgentId}`);
    
    // Update client-agent mapping
    if (frame.fromAgentId !== 'unknown' && frame.fromAgentId !== 'server') {
      const client = this.clients.get(clientId);
      if (client && client.agentId === 'unknown') {
        client.agentId = frame.fromAgentId;
      }
    }
    
    switch (frame.type) {
      case 'register':
        this.handleRegistration(frame, call, clientId);
        break;
        
      case 'heartbeat':
        this.handleHeartbeat(frame.fromAgentId);
        break;
        
      case 'agent_message_start':
      case 'agent_message_delta':
      case 'agent_message_end':
      case 'task_started':
      case 'task_progress':
      case 'tool_started':
      case 'tool_stdout':
      case 'tool_stderr':
      case 'tool_finished':
      case 'task_completed':
      case 'task_failed':
      case 'task_cancelled':
      case 'chat_message':
        this.routeFrame(frame);
        break;
        
      default:
        log.warn(`[gRPC] Unknown frame type: ${frame.type}`);
    }
    
    // Emit frame for external handlers
    this.options.onFrame?.(frame);
    this.emit('frame', frame);
  }
  
  private handleRegistration(frame: GrpcAgentFrame, call: grpc.ServerDuplexStream<any, any>, clientId: string) {
    try {
      const payload = frame.payload;
      if (!payload || !payload.agentId || !payload.agentName) {
        throw new Error('Missing agentId or agentName in registration');
      }
      
      const agentId = payload.agentId;
      const agentName = payload.agentName;
      const persona = payload.persona;
      const capabilities = payload.capabilities || [];
      const endpoint = payload.endpoint || `http://localhost:${this.options.port + 1}`;
      
      // Check if agent already registered (reconnection is normal)
      if (this.agents.has(agentId)) {
        log.debug(`[gRPC] Agent ${agentId} reconnected, updating connection`);
        const existingAgent = this.agents.get(agentId)!;
        existingAgent.call = call;
        existingAgent.lastSeen = Date.now();
      } else {
        // Register new agent
        const agent: ConnectedAgent = {
          id: agentId,
          name: agentName,
          call,
          persona,
          capabilities,
          endpoint,
          lastSeen: Date.now(),
          subscriptions: new Map(),
        };
        
        this.agents.set(agentId, agent);
        log.info(`[gRPC] Agent registered: ${agentName} (${agentId})`);
        
        // Update client mapping
        const client = this.clients.get(clientId);
        if (client) {
          client.agentId = agentId;
        }
        
        // Notify external handler
        this.options.onAgentRegistered?.({
          id: agentId,
          name: agentName,
          type: 'local',
          status: 'idle',
          capabilities,
          endpoint,
          workspace: '', // Workspace not known at registration time
          created: Date.now(),
          lastHeartbeat: Date.now(),
        });
        
        this.emit('agentRegistered', agentId);
      }
      
      // Send registration confirmation
      call.write(GrpcFrames.createRegistered(
        agentId,
        'registered',
        `Welcome ${agentName}`,
        `grpc://localhost:${this.options.port}`
      ));
      
    } catch (error) {
      log.error('[gRPC] Registration failed:', error);
      call.write(GrpcFrames.createRegistered(
        frame.payload?.agentId || 'unknown',
        'rejected',
        error instanceof Error ? error.message : 'Registration failed'
      ));
    }
  }
  
  private handleHeartbeat(agentId: string) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastSeen = Date.now();
    }
  }
  
  private routeFrame(frame: GrpcAgentFrame) {
    const { toAgentId, fromAgentId } = frame;
    
    if (toAgentId === 'broadcast') {
      this.broadcastFrame(frame, fromAgentId);
    } else if (toAgentId === 'server') {
      // Handle server-bound frames (e.g., task results to master)
      this.emit('serverFrame', frame);
    } else {
      this.sendToAgent(toAgentId, frame);
    }
  }
  
  private sendToAgent(agentId: string, frame: GrpcAgentFrame): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) {
      log.warn(`[gRPC] Agent ${agentId} not found for frame ${frame.type}`);
      return false;
    }
    
    try {
      log.info(`[gRPC] Sending ${frame.type} to ${agent.name} (${agentId}) parent=${frame.parentOperationId || '-'} to=${frame.toAgentId}`);
      const wrote = agent.call.write(frame);
      log.info(`[gRPC] Sent ${frame.type} to ${agent.name} (${agentId}) writeResult=${String(wrote)}`);
      return true;
    } catch (error) {
      log.error(`[gRPC] Failed to send ${frame.type} to ${agentId}:`, error);
      return false;
    }
  }
  
  private broadcastFrame(frame: GrpcAgentFrame, excludeAgentId?: string) {
    let count = 0;
    this.agents.forEach((agent, agentId) => {
      if (agentId !== excludeAgentId) {
        if (this.sendToAgent(agentId, frame)) {
          count++;
        }
      }
    });
    log.debug(`[gRPC] Broadcast from ${excludeAgentId || 'server'} to ${count} agents`);
  }
  
  private sendError(call: grpc.ServerDuplexStream<any, any>, error: string, clientId: string) {
    try {
      call.write(GrpcFrames.createErrorMessage(clientId, error));
    } catch (err) {
      log.error('[gRPC] Failed to send error:', err);
    }
  }
  
  private handleDisconnection(clientId: string) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    const agentId = client.agentId;
    this.clients.delete(clientId);
    
    if (agentId !== 'unknown' && this.agents.has(agentId)) {
      // Check if this was the last connection for this agent
      let hasOtherConnections = false;
      for (const [cid, c] of this.clients.entries()) {
        if (cid !== clientId && c.agentId === agentId) {
          hasOtherConnections = true;
          break;
        }
      }
      
      if (!hasOtherConnections) {
        this.agents.delete(agentId);
        log.info(`[gRPC] Agent disconnected: ${agentId}`);
        
        this.options.onAgentDisconnected?.(agentId);
        this.emit('agentDisconnected', agentId);
      }
    }
  }
  
  // Public API
  
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.bindAsync(
        `127.0.0.1:${this.options.port}`,
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
  
  sendFrame(frame: GrpcAgentFrame): boolean {
    return this.sendToAgent(frame.toAgentId, frame);
  }
  
  sendChat(fromAgentId: string, toAgentId: string, message: string, conversationId?: string, extraPayload?: Record<string, any>): boolean {
    const frame = GrpcFrames.createChatMessage(fromAgentId, toAgentId, message, conversationId, extraPayload);
    return this.sendFrame(frame);
  }
  
  sendTask(fromAgentId: string, toAgentId: string, taskId: string, tool: string, params: any, context?: any): boolean {
    const safeParams = sanitizeGrpcPayload({
      ...params,
      __context: context,
    });
    const frame = GrpcFrames.createTaskStarted(taskId, fromAgentId, toAgentId, tool, safeParams);
    return this.sendFrame(frame);
  }

  cancelTask(fromAgentId: string, toAgentId: string, taskId: string, reason?: string): boolean {
    const frame = GrpcFrames.createTaskCancelled(taskId, fromAgentId, toAgentId, reason);
    return this.sendFrame(frame);
  }
  
  broadcast(fromAgentId: string, message: string): number {
    const frame = GrpcFrames.createChatMessage(fromAgentId, 'broadcast', message);
    let count = 0;
    this.agents.forEach((agent, agentId) => {
      if (agentId !== fromAgentId) {
        if (this.sendToAgent(agentId, frame)) {
          count++;
        }
      }
    });
    return count;
  }
  
  getConnectedAgents(): Array<{id: string; name: string; persona?: Persona; capabilities: string[]}> {
    const agents: Array<{id: string; name: string; persona?: Persona; capabilities: string[]}> = [];
    this.agents.forEach(agent => {
      agents.push({
        id: agent.id,
        name: agent.name,
        persona: agent.persona,
        capabilities: agent.capabilities,
      });
    });
    return agents;
  }
  
  getAgentCount(): number {
    return this.agents.size;
  }
  
  isAgentConnected(agentId: string): boolean {
    return this.agents.has(agentId);
  }
}