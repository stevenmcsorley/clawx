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
  private activeTaskControllers = new Map<string, AbortController>();
  
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

      case 'task_cancelled':
        this.handleTaskCancelled(frame);
        break;
        
      default:
        log.debug(`Worker ${this.options.agentId} ignoring frame type: ${type}`);
    }
  }
  
  private async handleChatMessage(frame: any) {
    const { fromAgentId, payload, parentOperationId } = frame;
    const message = payload?.message;
    const mode = payload?.mode || 'discussion';
    const context = payload?.context || {};

    if (!message || !this.grpcClient) return;

    log.info(`Worker ${this.options.agentId} received chat from ${fromAgentId}: ${message.substring(0, 100)}...`);

    try {
      const { createDefaultPersona, createDefaultMemory, logConversationTurn, saveMemory, loadPersona, loadMemory } = await import('../utils/persona-utils.js');
      const { generateModelChatResponse, updateMemoryFromConversation } = await import('../utils/worker-model-caller.js');
      const { getWorkerTools, executeToolWithStream } = await import('../utils/worker-tool-executor.js');

      try {
        this.persona = loadPersona(this.options.workspace);
      } catch {
        // keep existing in-memory persona/default fallback
      }

      try {
        this.memory = loadMemory(this.options.workspace);
      } catch {
        // keep existing in-memory memory/default fallback
      }

      const persona = this.persona || createDefaultPersona(this.options.agentId, this.options.agentName);
      const memory = this.memory || createDefaultMemory();
      const turnId = parentOperationId || `chat_${Date.now()}`;
      const turn = {
        id: turnId,
        speaker: fromAgentId,
        target: this.options.agentId,
        message,
        context,
        mode,
        timestamp: Date.now(),
      };

      logConversationTurn(this.options.workspace, turn);
      const availableTools = getWorkerTools(this.options.workspace, this.options.allowedTools);

      const { reply, toolCalls } = await generateModelChatResponse(
        persona,
        memory,
        turn,
        this.options.workspace,
        availableTools,
        (event) => {
          switch (event.type) {
            case 'agent_message_start':
              this.grpcClient!.sendAgentMessageStart(turnId, 'server', event.persona);
              break;
            case 'agent_message_delta':
              this.grpcClient!.sendAgentMessageDelta(turnId, 'server', event.delta);
              break;
            case 'agent_message_end':
              break;
          }
        }
      );

      let finalReply = reply;
      const executedActions: string[] = [];
      const observedResults: string[] = [];

      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          const stream = executeToolWithStream(
            toolCall.name,
            toolCall.arguments || {},
            this.options.workspace,
            this.options.allowedTools,
            context,
            (event) => {
              switch (event.type) {
                case 'tool_started':
                  this.grpcClient!.sendToolStarted(turnId, 'server', event.toolName, event.params, 'chat');
                  break;
                case 'tool_stdout':
                  this.grpcClient!.sendToolStdout(turnId, 'server', event.data, 'chat');
                  break;
                case 'tool_stderr':
                  this.grpcClient!.sendToolStderr(turnId, 'server', event.data, 'chat');
                  break;
                case 'tool_finished':
                  this.grpcClient!.sendToolFinished(turnId, 'server', event.result, 'chat');
                  break;
              }
            },
            turnId,
            'chat'
          );
          const result = await stream.result;
          if (result.success) {
            executedActions.push(`${toolCall.name}: success`);
            if (result.output?.trim()) {
              observedResults.push(`${toolCall.name}: ${result.output.trim()}`);
            }
          } else {
            executedActions.push(`${toolCall.name}: failed`);
            observedResults.push(`${toolCall.name} failed: ${result.error || 'unknown error'}`);
          }
        }

        const toolSummary = observedResults.join('\n');
        const followUpTurn = {
          ...turn,
          id: `${turnId}_summary`,
          message:
            `${turn.message}\n\nObserved tool results from this turn:\n${toolSummary || '(no tool output)'}\n\nNow answer the user directly. Do not narrate tool execution. Summarize only the relevant observed results and changes in plain language.`,
        };

        const followUp = await generateModelChatResponse(
          persona,
          memory,
          followUpTurn,
          this.options.workspace,
          [],
          undefined,
          0,
        );
        finalReply = followUp.reply?.trim() || finalReply;
      }

      this.memory = updateMemoryFromConversation(memory, persona, turn as any, finalReply);
      saveMemory(this.options.workspace, this.memory);

      logConversationTurn(this.options.workspace, {
        id: `${turnId}_reply`,
        speaker: this.options.agentId,
        target: fromAgentId,
        message: finalReply,
        context: { executed_actions: executedActions, tool_calls_executed: toolCalls?.length || 0 },
        mode,
        timestamp: Date.now(),
      });

      this.grpcClient.sendAgentMessageEnd(turnId, 'server', finalReply);
    } catch (error) {
      log.error(`Worker ${this.options.agentId} failed chat ${parentOperationId}:`, error);
      this.grpcClient.sendAgentMessageEnd(parentOperationId || `chat_${Date.now()}`, 'server', `Chat failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  private handleTaskCancelled(frame: any) {
    const { parentOperationId, fromAgentId, payload } = frame;
    const taskId = parentOperationId;
    const reason = payload?.reason || 'Cancelled by master';

    const controller = this.activeTaskControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.activeTaskControllers.delete(taskId);
    }

    if (this.grpcClient) {
      this.grpcClient.sendTaskCancelled(taskId, 'server', reason);
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
    this.grpcClient.sendTaskProgress(parentOperationId, 'server', 0, `Starting ${tool}...`);
    
    const taskAbortController = new AbortController();
    this.activeTaskControllers.set(parentOperationId, taskAbortController);

    try {
      // Execute the actual tool using the existing execution path
      const { executeToolWithStream } = await import('../utils/worker-tool-executor.js');
      
      // Send tool started event
      this.grpcClient.sendToolStarted(parentOperationId, 'server', tool, params, 'task');
      
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
              this.grpcClient!.sendToolStdout(parentOperationId, 'server', event.data);
              break;
            case 'tool_stderr':
              this.grpcClient!.sendToolStderr(parentOperationId, 'server', event.data);
              break;
            case 'tool_finished':
              this.grpcClient!.sendToolFinished(parentOperationId, 'server', {
                success: event.result?.success,
                output: event.result?.output,
                details: event.result?.details,
                error: event.result?.error,
              });
              break;
          }
        },
        parentOperationId,
        'task',
        taskAbortController.signal
      );
      
      // Send progress updates
      this.grpcClient.sendTaskProgress(parentOperationId, 'server', 25, `Executing ${tool}...`);
      
      // Wait for tool completion
      const result = await stream.result;

      if (taskAbortController.signal.aborted) {
        this.grpcClient.sendTaskCancelled(parentOperationId, 'server', 'Cancelled by master');
        return;
      }
      
      this.grpcClient.sendTaskProgress(parentOperationId, 'server', 100, `Task ${parentOperationId} completed`);
      
      // Send task completion
      this.grpcClient.sendTaskCompleted(parentOperationId, 'server', {
        success: result.success,
        message: `Task ${parentOperationId} completed`,
        result: {
          success: result.success,
          output: result.output,
          details: result.details,
          error: result.error,
        }
      });
      
      log.info(`Worker ${this.options.agentId} completed task ${parentOperationId}: ${tool}`);
      
    } catch (error) {
      log.error(`Worker ${this.options.agentId} failed task ${parentOperationId}:`, error);
      
      if (this.grpcClient) {
        if (taskAbortController.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
          this.grpcClient.sendTaskCancelled(parentOperationId, 'server', 'Cancelled by master');
        } else {
          this.grpcClient.sendTaskFailed(parentOperationId, 'server', 
            error instanceof Error ? error.message : String(error));
        }
      }
    } finally {
      this.activeTaskControllers.delete(parentOperationId);
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