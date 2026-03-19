/**
 * Worker Agent with gRPC Transport
 * 
 * A worker agent that connects to master via gRPC for all live communication
 */

import { log } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { GrpcClient } from './grpc/grpc-client.js';
import { loadPersona, loadMemory } from '../utils/persona-utils.js';
import type { AgentConfig } from '../types/agent.js';
import type { Persona, Memory } from '../types/persona.js';

export interface WorkerAgentOptions {
  agentId: string;
  agentName: string;
  workspace: string;
  masterGrpcEndpoint: string; // grpc://localhost:port
  allowedTools: string[];
  persona?: Persona;
  httpEndpoint?: string;
}

export class WorkerAgent {
  private grpcClient: GrpcClient | null = null;
  private persona: Persona | null = null;
  private memory: Memory | null = null;
  private isConnected = false;
  
  constructor(private options: WorkerAgentOptions) {
    this.loadPersonaAndMemory();
  }
  
  private loadPersonaAndMemory() {
    try {
      this.persona = loadPersona(this.options.workspace);
      log.debug(`Loaded persona for ${this.options.agentName}`);
    } catch (error) {
      log.debug(`No persona found for ${this.options.agentName}`);
    }
    
    try {
      this.memory = loadMemory(this.options.workspace);
      log.debug(`Loaded memory for ${this.options.agentName}`);
    } catch (error) {
      log.debug(`No memory found for ${this.options.agentName}`);
    }
  }
  
  async connect(): Promise<void> {
    if (this.grpcClient) {
      log.debug(`Worker ${this.options.agentId} already connected`);
      return;
    }
    
    log.info(`Worker ${this.options.agentName} connecting to master via gRPC: ${this.options.masterGrpcEndpoint}`);
    
    this.grpcClient = new GrpcClient({
      agentId: this.options.agentId,
      agentName: this.options.agentName,
      persona: this.persona || undefined,
      capabilities: this.options.allowedTools,
      endpoint: this.options.httpEndpoint || `http://localhost:${process.env.PORT || '0'}`,
      serverAddress: this.options.masterGrpcEndpoint,
      reconnectDelay: 5000,
      heartbeatInterval: 30000,
      onFrame: (frame) => this.handleGrpcFrame(frame),
      onRegistered: (agentId) => {
        log.info(`Worker ${agentId} registered with master via gRPC`);
        this.isConnected = true;
      },
      onDisconnected: () => {
        log.warn(`Worker ${this.options.agentId} disconnected from master`);
        this.isConnected = false;
      },
      onError: (error) => {
        log.error(`Worker ${this.options.agentId} gRPC error:`, error);
      },
    });
    
    // Wait for connection
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Worker failed to connect to master within 10 seconds`));
      }, 10000);
      
      this.grpcClient!.on('registered', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      this.grpcClient!.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }
  
  private handleGrpcFrame(frame: any) {
    const { type, fromAgentId, toAgentId, parentOperationId, parentOperationType, payload } = frame;
    
    log.debug(`Worker ${this.options.agentId} received ${type} from ${fromAgentId}`);
    
    switch (type) {
      case 'chat_message':
        this.handleChatMessage(frame);
        break;
        
      case 'task_started':
        this.handleTaskStarted(frame);
        break;
        
      case 'tool_started':
        this.handleToolStarted(frame);
        break;
        
      default:
        log.debug(`Worker ${this.options.agentId} ignoring frame type: ${type}`);
    }
  }
  
  private handleChatMessage(frame: any) {
    const { fromAgentId, payload, parentOperationId } = frame;
    const message = payload?.message;
    
    if (!message) return;
    
    log.info(`Worker ${this.options.agentId} received chat from ${fromAgentId}: ${message.substring(0, 100)}...`);
    
    // In a real implementation, this would trigger AI response generation
    // For now, just acknowledge receipt
    if (this.grpcClient) {
      this.grpcClient.sendChat(
        fromAgentId,
        `Received your message: "${message.substring(0, 50)}..."`,
        parentOperationId
      );
    }
  }
  
  private async handleTaskStarted(frame: any) {
    const { parentOperationId, fromAgentId, payload } = frame;
    const { tool, params } = payload || {};
    const context = params?.__context || payload?.context || {};
    const actualParams = params?.__context ? { ...params } : (params || {});
    if (actualParams.__context) {
      delete actualParams.__context;
    }
    
    log.info(`Worker ${this.options.agentId} starting task ${parentOperationId}: ${tool}`);
    
    if (!this.grpcClient) {
      log.error(`Worker ${this.options.agentId} not connected, cannot execute task`);
      return;
    }
    
    // Send task started acknowledgment
    this.grpcClient.sendTaskProgress(parentOperationId, fromAgentId, 0, `Starting ${tool}...`);
    
    try {
      // Execute the actual tool using the existing execution path
      const { executeToolWithStream } = await import('../utils/worker-tool-executor.js');
      
      // Send tool started event
      this.grpcClient.sendToolStarted(parentOperationId, fromAgentId, tool, params, 'task');
      
      // Execute tool with streaming
      const stream = executeToolWithStream(
        tool,
        actualParams,
        this.options.workspace,
        this.options.allowedTools,
        context,
        (event) => {
          // Forward tool events via gRPC
          switch (event.type) {
            case 'tool_stdout':
              this.grpcClient!.sendToolStdout(parentOperationId, fromAgentId, event.data);
              break;
            case 'tool_stderr':
              this.grpcClient!.sendToolStderr(parentOperationId, fromAgentId, event.data);
              break;
            case 'tool_finished':
              this.grpcClient!.sendToolFinished(parentOperationId, fromAgentId, event.result);
              break;
          }
        },
        parentOperationId,
        'task'
      );
      
      // Send progress updates
      this.grpcClient.sendTaskProgress(parentOperationId, fromAgentId, 25, `Executing ${tool}...`);
      
      // Wait for tool completion
      const result = await stream.result;
      
      this.grpcClient.sendTaskProgress(parentOperationId, fromAgentId, 100, `Task ${parentOperationId} completed`);
      
      // Send task completion
      this.grpcClient.sendTaskCompleted(parentOperationId, fromAgentId, {
        success: result.success,
        message: `Task ${parentOperationId} completed`,
        result: result
      });
      
      log.info(`Worker ${this.options.agentId} completed task ${parentOperationId}: ${tool}`);
      
    } catch (error) {
      log.error(`Worker ${this.options.agentId} failed task ${parentOperationId}:`, error);
      
      if (this.grpcClient) {
        this.grpcClient.sendTaskFailed(parentOperationId, fromAgentId, 
          error instanceof Error ? error.message : String(error));
      }
    }
  }
  
  private handleToolStarted(frame: any) {
    const { parentOperationId, fromAgentId, payload } = frame;
    const { toolName, params } = payload || {};
    
    log.info(`Worker ${this.options.agentId} starting tool ${toolName} for task ${parentOperationId}`);
    
    // Send tool output simulation
    if (this.grpcClient) {
      this.grpcClient.sendToolStdout(parentOperationId, fromAgentId, `Starting ${toolName} with params: ${JSON.stringify(params)}`);
      
      setTimeout(() => {
        this.grpcClient!.sendToolStdout(parentOperationId, fromAgentId, `Tool ${toolName} executing...`);
        this.grpcClient!.sendToolFinished(parentOperationId, fromAgentId, { success: true, output: 'Simulated tool execution' });
      }, 500);
    }
  }
  
  sendChat(toAgentId: string, message: string, conversationId?: string): boolean {
    if (!this.grpcClient || !this.isConnected) {
      log.error(`Worker ${this.options.agentId} not connected, cannot send chat`);
      return false;
    }
    
    return this.grpcClient.sendChat(toAgentId, message, conversationId);
  }
  
  disconnect(): void {
    if (this.grpcClient) {
      this.grpcClient.disconnect();
      this.grpcClient = null;
      this.isConnected = false;
    }
  }
  
  isConnectedToMaster(): boolean {
    return this.isConnected && this.grpcClient?.isRegistered() === true;
  }
  
  getAgentId(): string {
    return this.options.agentId;
  }
  
  getAgentName(): string {
    return this.options.agentName;
  }
}