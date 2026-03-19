/**
 * Agent HTTP Server with gRPC Transport
 * 
 * HTTP server for agent communication with gRPC as the live transport.
 * Localhost only, no authentication in v1.
 */

import express, { Request, Response } from 'express';
import { createServer, Server } from 'http';
import { log } from '../utils/logger.js';
import { AgentConfig, AgentIdentity, AgentTask } from '../types/agent.js';
import { v4 as uuidv4 } from 'uuid';
import { GrpcServer } from './grpc/grpc-server.js';
import { createSearchFilesTool } from '../tools/searchFiles.js';
import { createGitStatusTool } from '../tools/gitStatus.js';
import { createGitDiffTool } from '../tools/gitDiff.js';
import { createSshRunTool } from '../tools/sshRun.js';
import {
  createCodingTools,
  createGrepTool,
  createFindTool,
  createLsTool,
} from '@mariozechner/pi-coding-agent';
import { getPlatformSearchCapabilities } from '../utils/search-utils.js';
import { 
  loadPersona, 
  loadMemory, 
  saveMemory, 
  logConversationTurn,
  buildPersonaContext,
  createDefaultPersona,
  createDefaultMemory 
} from '../utils/persona-utils.js';
import { generateModelChatResponse, updateMemoryFromConversation } from '../utils/worker-model-caller.js';
import { getWorkerTools, executeToolCalls, executeToolWithStream } from '../utils/worker-tool-executor.js';
import { createAgentChatDirectTool } from '../tools/agentChatDirect.js';
import { createAgentGrpcChatTool } from '../tools/agentGrpcChat.js';
import type { Persona, Memory, ChatRequest, ChatResponse, ConversationTurn } from '../types/persona.js';

export interface AgentServer {
  port: number;
  grpcPort?: number;
  app: express.Application;
  close: () => void;
}

export async function startAgentServer(config: AgentConfig): Promise<AgentServer> {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  const server = createServer(app);
  const tasks = new Map<string, AgentTask>();
  
  // Start gRPC server for live communication
  let grpcServer: GrpcServer | undefined;
  let grpcPort: number | undefined;
  
  if (config.port !== undefined) {
    grpcPort = config.port + 2000;
    log.info(`Starting gRPC server on port ${grpcPort}...`);
    
    try {
      grpcServer = new GrpcServer({
        port: grpcPort,
        onAgentRegistered: (agent) => {
          log.info(`[gRPC] Agent registered: ${agent.name} (${agent.id})`);
        },
        onAgentDisconnected: (agentId) => {
          log.info(`[gRPC] Agent disconnected: ${agentId}`);
        },
        onFrame: (frame) => {
          // Handle incoming gRPC frames
          handleGrpcFrame(frame);
        },
      });
      
      await grpcServer.start();
      log.info(`✅ Agent gRPC server started on port ${grpcPort}`);
    } catch (error) {
      log.error(`❌ Failed to start gRPC server on port ${grpcPort}:`, error);
    }
  }
  
  function handleGrpcFrame(frame: any) {
    const { type, fromAgentId, toAgentId, parentOperationId, parentOperationType, payload } = frame;
    
    log.debug(`[gRPC] Received ${type} from ${fromAgentId} to ${toAgentId}`);
    
    // Handle different frame types
    switch (type) {
      case 'task_completed':
        // Task completed by worker
        log.info(`Task ${parentOperationId} completed by worker ${fromAgentId}`);
        break;
        
      case 'task_failed':
        // Task failed by worker
        log.error(`Task ${parentOperationId} failed by worker ${fromAgentId}: ${payload?.error}`);
        break;
        
      case 'task_progress':
        // Task progress update
        log.debug(`Task ${parentOperationId} progress: ${payload?.progress}% - ${payload?.message}`);
        break;
        
      case 'tool_stdout':
      case 'tool_stderr':
        // Tool output
        log.debug(`Task ${parentOperationId} tool ${type}: ${payload?.data?.substring(0, 200)}...`);
        break;
        
      case 'chat_message':
        // Chat message from worker
        log.info(`Chat from ${fromAgentId}: ${payload?.message?.substring(0, 100)}...`);
        break;
    }
  }

  /** Execute a task with real tool with timeout (gRPC version) */
  async function executeTask(taskId: string, tool: string, params: any, context: any): Promise<void> {
    const task = tasks.get(taskId);
    if (!task) return;
    
    task.status = 'running';
    task.started = Date.now();
    
    // Set up timeout
    const timeoutMs = 2 * 60 * 1000; // 2 minutes default timeout (shorter for agents)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        const error = new Error(`Task timeout after ${timeoutMs}ms`);
        reject(error);
      }, timeoutMs);
    });
    
    try {
      // Get the appropriate tool
      let toolDefinition;
      // Use current directory from context, or workspace as fallback
      const cwd = context?.cwd || config.workspace;
      
      // Check if tool is allowed
      // Empty allowedTools array means all tools are allowed
      if (config.allowedTools.length > 0 && !config.allowedTools.includes(tool)) {
        const error = new Error(`Tool "${tool}" not allowed. Allowed: ${config.allowedTools.join(', ')}`);
        throw error;
      }
      
      // Tools that agents can execute (expanded for grounded chat)
      // First check pi-coding-agent tools
      const codingTools = createCodingTools(cwd);
      const codingTool = codingTools.find(t => t.name === tool);
      if (codingTool) {
        toolDefinition = codingTool;
      } else {
        // Check other tools
        switch (tool) {
          case 'grep':
            toolDefinition = createGrepTool(cwd);
            break;
          case 'find':
            toolDefinition = createFindTool(cwd);
            break;
          case 'ls':
            toolDefinition = createLsTool(cwd);
            break;
          case 'search_files':
            toolDefinition = createSearchFilesTool(cwd);
            break;
          case 'git_status':
            toolDefinition = createGitStatusTool(cwd);
            break;
          case 'git_diff':
            toolDefinition = createGitDiffTool(cwd);
            break;
          case 'ssh_run':
            // SSH targets from config (empty for now)
            toolDefinition = createSshRunTool({});
            break;
          case 'agent_chat_direct':
            toolDefinition = createAgentChatDirectTool(cwd);
            break;
          case 'agent_grpc_chat':
            if (grpcServer) {
              toolDefinition = createAgentGrpcChatTool(config, grpcServer, tasks);
            } else {
              const error = new Error(`gRPC server not available. Cannot use agent_grpc_chat tool.`);
              throw error;
            }
            break;
          default:
            const error = new Error(`Tool not supported by agent: ${tool}. Supported tools: coding tools (read, write, edit, bash), grep, find, ls, search_files, git_status, git_diff, ssh_run, agent_chat_direct, agent_grpc_chat`);
            throw error;
        }
      }
      
      // Execute the tool with streaming (no EventStream callbacks)
      const stream = executeToolWithStream(tool, params, config.workspace, config.allowedTools, context, (event) => {
        // Tool events are handled by the tool itself or via gRPC
        // No more EventStream usage
      }, taskId, 'task');
      
      // Wait for result with timeout
      const result = await Promise.race([
        stream.result,
        timeoutPromise,
      ]);
      
      // Update task with result
      task.status = 'completed';
      task.completed = Date.now();
      task.result = result;
      
      log.info(`Task ${taskId} completed successfully`);
      
    } catch (error) {
      task.status = 'failed';
      task.completed = Date.now();
      task.error = error instanceof Error ? error.message : String(error);
      
      log.error(`Task ${taskId} failed:`, error);
    }
  }

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      agentId: config.id,
      agentName: config.name,
      status: 'healthy',
      timestamp: Date.now(),
      grpcEnabled: !!grpcServer,
      grpcPort,
      taskCount: tasks.size,
      connectedAgents: grpcServer ? grpcServer.getAgentCount() : 0,
    });
  });
  
  // List agents (for masters)
  app.get('/agents', (req: Request, res: Response) => {
    if (grpcServer) {
      const agents = grpcServer.getConnectedAgents();
      res.json(agents);
    } else {
      res.json([]);
    }
  });
  
  // Task submission - gRPC version
  app.post('/task', async (req: Request, res: Response) => {
    try {
      const { tool, params, context, taskId: requestedTaskId, targetAgentId } = req.body;
      
      if (!tool) {
        return res.status(400).json({ error: 'tool name required' });
      }
      
      // Use requested task ID if provided, otherwise generate one
      const taskId = requestedTaskId || uuidv4();
      
      // If targetAgentId is provided and connected via gRPC, route via gRPC
      if (targetAgentId && grpcServer && grpcServer.isAgentConnected(targetAgentId)) {
        log.info(`Routing task ${taskId} to worker ${targetAgentId} via gRPC: ${tool}`);
        
        // Send task via gRPC
        const sent = grpcServer.sendTask(targetAgentId, taskId, tool, params, context);
        
        if (!sent) {
          return res.status(404).json({ error: `Worker ${targetAgentId} not connected via gRPC` });
        }
        
        // Create task record
        const task: AgentTask = {
          id: taskId,
          agentId: targetAgentId,
          type: 'execute',
          payload: { tool, params, context },
          status: 'running',
          created: Date.now(),
          started: Date.now(),
        };
        
        tasks.set(taskId, task);
        
        return res.json({
          taskId,
          status: 'accepted',
          message: `Task routed to worker ${targetAgentId} via gRPC`,
          routed: true,
          transport: 'grpc',
        });
      }
      
      // Fallback: local execution (for self-tasks or when no target specified)
      log.info(`Executing task ${taskId} locally: ${tool}`);
      
      // Check if tool is allowed
      if (config.allowedTools.length > 0 && !config.allowedTools.includes(tool)) {
        return res.status(403).json({ 
          error: `Tool "${tool}" not allowed. Allowed: ${config.allowedTools.join(', ')}` 
        });
      }
      
      const task: AgentTask = {
        id: taskId,
        agentId: config.id,
        type: 'execute',
        payload: { tool, params, context },
        status: 'pending',
        created: Date.now(),
      };
      
      tasks.set(taskId, task);
      
      // Execute task in background (legacy HTTP path)
      executeTask(taskId, tool, params, context).catch(error => {
        log.error(`Task ${taskId} execution failed:`, error);
        const storedTask = tasks.get(taskId);
        if (storedTask) {
          storedTask.status = 'failed';
          storedTask.completed = Date.now();
          storedTask.error = error.message;
        }
      });
      
      res.json({
        taskId,
        status: 'accepted',
        message: 'Task queued for local execution',
      });
      
    } catch (error) {
      log.error('Task submission failed:', error);
      res.status(500).json({ error: 'Task submission failed' });
    }
  });
  
  // Task status
  app.get('/task/:id/status', (req: Request, res: Response) => {
    const taskId = req.params.id as string;
    const task = tasks.get(taskId);
    
    if (!task) {
      return res.status(404).json({ error: `Task ${taskId} not found` });
    }
    
    res.json({
      taskId,
      status: task.status,
      agentId: task.agentId,
      created: task.created,
      started: task.started,
      completed: task.completed,
      result: task.result,
      error: task.error,
    });
  });
  
  // Cancel task
  app.post('/task/:id/cancel', (req: Request, res: Response) => {
    const taskId = req.params.id as string;
    const task = tasks.get(taskId);
    
    if (!task) {
      return res.status(404).json({ error: `Task ${taskId} not found` });
    }
    
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return res.status(400).json({ error: `Task ${taskId} is already ${task.status}` });
    }
    
    task.status = 'cancelled';
    task.completed = Date.now();
    
    res.json({
      taskId,
      status: 'cancelled',
      message: `Task ${taskId} cancelled`,
    });
  });
  
  // List tasks
  app.get('/tasks', (req: Request, res: Response) => {
    const taskList = Array.from(tasks.values()).map(t => ({
      id: t.id,
      status: t.status,
      agentId: t.agentId,
      tool: t.payload?.tool || 'unknown',
      created: t.created,
      started: t.started,
      completed: t.completed,
    }));
    
    res.json(taskList);
  });
  
  // Register with master (for agents)
  app.post('/register', async (req: Request, res: Response) => {
    try {
      const { masterEndpoint } = req.body;
      
      if (!masterEndpoint) {
        return res.status(400).json({ error: 'masterEndpoint required' });
      }
      
      // TODO: Register with master
      log.info(`Would register with master: ${masterEndpoint}`);
      
      res.json({ success: true });
    } catch (error) {
      log.error('Registration failed:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  });
  
  // Accept registration from workers (for masters)
  app.post('/register-worker', async (req: Request, res: Response) => {
    try {
      const { agentId, agentName, endpoint, capabilities } = req.body;
      
      if (!agentId || !agentName || !endpoint) {
        return res.status(400).json({ error: 'agentId, agentName, and endpoint required' });
      }
      
      // In a real implementation, this would update a registry
      log.info(`Worker registered: ${agentName} (${agentId}) at ${endpoint}`);
      
      res.json({ success: true, registered: true });
    } catch (error) {
      log.error('Worker registration failed:', error);
      res.status(500).json({ error: 'Worker registration failed' });
    }
  });
  
  // Chat turn - conversational interaction (via gRPC when possible)
  app.post('/chat', async (req: Request, res: Response) => {
    const turnId = uuidv4();
    
    try {
      const { speaker, target, message, context, mode = 'discussion' } = req.body as ChatRequest;
      
      if (!speaker || !target || !message) {
        return res.status(400).json({ error: 'speaker, target, and message required' });
      }
      
      // If we have a gRPC server and target is a connected agent, use gRPC
      if (grpcServer && grpcServer.isAgentConnected(target) && target !== config.id) {
        log.info(`Routing chat via gRPC from ${speaker} to ${target}`);
        
        // Send chat message via gRPC
        const sent = grpcServer.sendChat(speaker, target, message, turnId);
        
        if (!sent) {
          return res.status(404).json({ error: `Agent ${target} not connected via gRPC` });
        }
        
        // Return immediate acknowledgment
        const response = {
          turnId,
          speaker: config.id,
          target: speaker,
          message: `Chat routed to ${target} via gRPC`,
          timestamp: Date.now(),
          routed: true,
          transport: 'grpc',
        };
        
        return res.json(response);
      }
      
      // Fallback: local chat processing (for self-chat or when gRPC not available)
      log.info(`Processing chat locally for ${target}`);
      
      // Load persona and memory for this agent
      const persona = loadPersona(config.workspace) || createDefaultPersona(config.id, config.name);
      const memory = loadMemory(config.workspace) || createDefaultMemory();
      
      // Create conversation turn
      const turn: ConversationTurn = {
        id: turnId,
        speaker,
        target,
        message,
        context,
        mode,
        timestamp: Date.now(),
      };
      
      // Log the incoming turn
      logConversationTurn(config.workspace, turn);
      
      // Build persona context for the model
      const personaContext = buildPersonaContext(persona, memory);
      
      // Get available tools for grounded execution
      const availableTools = getWorkerTools(config.workspace, config.allowedTools);
      
      // Generate response using actual model with access to real tools
      const { reply, thinking, toolCalls } = await generateModelChatResponse(
        persona,
        memory,
        turn,
        config.workspace,
        availableTools
      );
      
      let finalReply = reply;
      const executedActions: string[] = [];
      
      // Execute any tool calls the model requested
      if (toolCalls && toolCalls.length > 0) {
        log.info(`Executing ${toolCalls.length} tool calls from chat response`);
        
        for (const toolCall of toolCalls) {
          const { name, arguments: args } = toolCall;
          
          // Execute tool
          const stream = executeToolWithStream(name, args, config.workspace, config.allowedTools, turn.context, (event) => {
            // Tool events could be sent via gRPC if we had proper client
          }, turnId, 'chat');
          const result = await stream.result;
          
          if (result.success) {
            finalReply += `\n\n**Tool ${name} executed successfully:**\n${result.output}`;
            executedActions.push(`${name}: success`);
          } else {
            finalReply += `\n\n**Tool ${name} failed:** ${result.error}`;
            executedActions.push(`${name}: failed`);
          }
        }
      }
      
      // Update memory with the conversation
      const updatedMemory = updateMemoryFromConversation(memory, persona, turn, finalReply);
      saveMemory(config.workspace, updatedMemory);
      
      // Log the response turn
      const responseTurn: ConversationTurn = {
        id: uuidv4(),
        speaker: config.id,
        target: speaker,
        message: finalReply,
        context: {
          persona_applied: !!persona,
          persona_name: persona?.name || 'default',
          persona_role: persona?.role || 'Agent',
          response_style: persona?.tone || 'neutral',
          model_used: true,
          tool_calls_executed: toolCalls?.length || 0,
          executed_actions: executedActions,
        },
        mode,
        timestamp: Date.now(),
        notes: {
          persona_applied: !!persona,
          persona_name: persona?.name || 'default',
          persona_role: persona?.role || 'Agent',
          response_style: persona?.tone || 'neutral',
          model_used: true,
          tool_calls_executed: toolCalls?.length || 0,
          executed_actions: executedActions,
        },
      };
      logConversationTurn(config.workspace, responseTurn);
      
      res.json({
        success: true,
        turnId,
        response: {
          reply: finalReply,
          notes: {
            persona_applied: !!persona,
            persona_name: persona?.name || 'default',
            persona_role: persona?.role || 'Agent',
            response_style: persona?.tone || 'neutral',
            model_used: true,
            tool_calls_executed: toolCalls?.length || 0,
            executed_actions: executedActions,
          },
          memory_update: `Conversation with ${speaker}: ${turn.message.substring(0, 50)}...`,
          next_actions: executedActions.length > 0 ? ['continue_conversation'] : ['continue_conversation', 'suggest_task_if_needed'],
        },
        persona: {
          name: persona.name,
          role: persona.role,
        },
      });
      
    } catch (error) {
      log.error('Chat turn failed:', error);
      
      res.status(500).json({ 
        error: 'Chat turn failed',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Heartbeat
  app.post('/heartbeat', (req: Request, res: Response) => {
    res.json({
      agentId: config.id,
      status: 'alive',
      timestamp: Date.now(),
      taskCount: tasks.size,
    });
  });
  
  // Start server
  return new Promise((resolve, reject) => {
    const port = config.port || 0; // 0 = auto
    
    server.listen(port, 'localhost', () => {
      const address = server.address();
      const actualPort = typeof address === 'string' ? parseInt(address.split(':').pop() || '0', 10) : address?.port || 0;
      
      log.info(`Agent server listening on http://localhost:${actualPort}`);
      
      resolve({
        port: actualPort,
        grpcPort,
        app,
        close: () => {
          if (grpcServer) {
            grpcServer.stop();
          }
          server.close();
        },
      });
    });
    
    server.on('error', (error) => {
      log.error('Server error:', error);
      reject(error);
    });
  });
}