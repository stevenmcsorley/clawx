/**
 * Agent HTTP Server
 * 
 * Simple HTTP server for agent communication.
 * Localhost only, no authentication in v1.
 */

import express, { Request, Response } from 'express';
import { createServer, Server } from 'http';
import { log } from '../utils/logger.js';
import { AgentConfig, AgentIdentity, AgentTask } from '../types/agent.js';
import { v4 as uuidv4 } from 'uuid';
import { AgentWebSocketServer } from './agent-websocket.js';
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
import { EventStream, createSSEHandler } from '../utils/streaming-events.js';
import { createAgentChatDirectTool } from '../tools/agentChatDirect.js';
import { createAgentWebSocketChatTool } from '../tools/agentWebSocketChat.js';
import type { Persona, Memory, ChatRequest, ChatResponse, ConversationTurn } from '../types/persona.js';

export interface AgentServer {
  port: number;
  wsPort?: number;
  app: express.Application;
  close: () => void;
}

export async function startAgentServer(config: AgentConfig): Promise<AgentServer> {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  
  const server = createServer(app);
  const tasks = new Map<string, AgentTask>();
  const eventStream = new EventStream(config.id);
  
  // Start WebSocket server on next available port
  let wsServer: AgentWebSocketServer | undefined;
  let wsPort: number | undefined;
  
  try {
    // Use port + 1000 for WebSocket (e.g., HTTP 43301 → WS 44301)
    wsPort = config.port + 1000;
    log.info(`Attempting to start WebSocket server on port ${wsPort}...`);
    wsServer = new AgentWebSocketServer(wsPort);
    log.info(`✅ Agent WebSocket server started on port ${wsPort}`);
  } catch (error) {
    log.error(`❌ Failed to start WebSocket server on port ${wsPort}:`, error);
    log.warn(`Agent chat will be HTTP-only.`);
  }
  
  /** Execute a task with real tool with timeout and streaming */
  async function executeTask(taskId: string, tool: string, params: any, context: any): Promise<void> {
    const task = tasks.get(taskId);
    if (!task) return;
    
    task.status = 'running';
    task.started = Date.now();
    
    // Send task started event
    eventStream.sendTaskStarted(taskId, tool, params);
    
    // Set up timeout
    const timeoutMs = 2 * 60 * 1000; // 2 minutes default timeout (shorter for agents)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        const error = new Error(`Task timeout after ${timeoutMs}ms`);
        eventStream.sendTaskFailed(taskId, error.message);
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
        eventStream.sendTaskFailed(taskId, error.message);
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
          case 'agent_ws_chat':
            toolDefinition = createAgentWebSocketChatTool(cwd);
            break;
          default:
            const error = new Error(`Tool not supported by agent: ${tool}. Supported tools: coding tools (read, write, edit, bash), grep, find, ls, search_files, git_status, git_diff, ssh_run, agent_chat_direct, agent_ws_chat`);
            eventStream.sendTaskFailed(taskId, error.message);
            throw error;
        }
      }
      
      // Send tool started event
      eventStream.sendToolStarted(taskId, tool, params, 'task');
      
      // Execute the tool with streaming
      const stream = executeToolWithStream(tool, params, config.workspace, config.allowedTools, context, (event) => {
        if (event.type === 'tool_stdout') {
          eventStream.sendToolStdout(taskId, event.data, 'task');
        } else if (event.type === 'tool_stderr') {
          eventStream.sendToolStderr(taskId, event.data, 'task');
        } else if (event.type === 'tool_finished') {
          eventStream.sendToolFinished(taskId, event.result, 'task');
        }
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
      
      // Send task completed event
      eventStream.sendTaskCompleted(taskId, result);
      
      log.info(`Task ${taskId} completed successfully`);
      
    } catch (error) {
      task.status = 'failed';
      task.completed = Date.now();
      task.error = error instanceof Error ? error.message : String(error);
      
      // Send task failed event
      eventStream.sendTaskFailed(taskId, task.error);
      
      log.error(`Task ${taskId} failed:`, error);
    }
  }
  
  /** Generate chat response using actual model with persona context and real tools */
  async function generateChatResponse(
    persona: Persona | null, 
    memory: Memory | null, 
    turn: ConversationTurn, 
    personaContext: string,
    workspace: string
  ): Promise<ChatResponse> {
    try {
      // Get available tools for grounded execution
      const availableTools = getWorkerTools(workspace, config.allowedTools);
      
      // Generate response using actual model with access to real tools
      const { reply, thinking, toolCalls } = await generateModelChatResponse(
        persona,
        memory,
        turn,
        workspace,
        availableTools
      );
      
      let finalReply = reply;
      const executedActions: string[] = [];
      
      // Execute any tool calls the model requested
      if (toolCalls && toolCalls.length > 0) {
        log.info(`Executing ${toolCalls.length} tool calls from chat response`);
        
        const { results, combinedOutput } = await executeToolCalls(
          toolCalls,
          workspace,
          config.allowedTools,
          turn.context
        );
        
        // Append tool execution results to reply
        finalReply += combinedOutput;
        
        // Track executed actions
        toolCalls.forEach((tc, i) => {
          if (results[i]?.success) {
            executedActions.push(`${tc.name}: success`);
          } else {
            executedActions.push(`${tc.name}: failed`);
          }
        });
      }
      
      // Update memory based on conversation
      const updatedMemory = updateMemoryFromConversation(memory, persona, turn, finalReply);
      saveMemory(workspace, updatedMemory);
      
      return {
        reply: finalReply,
        notes: {
          persona_applied: !!persona,
          persona_name: persona?.name || 'default',
          persona_role: persona?.role || 'Agent',
          response_style: persona?.tone || 'neutral',
          model_used: true,
          thinking_length: thinking?.length || 0,
          tool_calls_executed: toolCalls?.length || 0,
          executed_actions: executedActions,
        },
        memory_update: `Conversation with ${turn.speaker}: ${turn.message.substring(0, 50)}...`,
        next_actions: executedActions.length > 0 ? ['continue_conversation'] : ['continue_conversation', 'suggest_task_if_needed'],
      };
      
    } catch (error) {
      log.error('Failed to generate model chat response:', error);
      
      // Fallback response if model fails
      const fallbackReply = persona 
        ? `As ${persona.name} (${persona.role}), I received your message: "${turn.message.substring(0, 100)}${turn.message.length > 100 ? '...' : ''}"\n\n[Note: Model call failed, using fallback response]`
        : `I received your message: "${turn.message.substring(0, 100)}${turn.message.length > 100 ? '...' : ''}"\n\n[Note: Model call failed, using fallback response]`;
      
      return {
        reply: fallbackReply,
        notes: {
          persona_applied: !!persona,
          persona_name: persona?.name || 'default',
          persona_role: persona?.role || 'Agent',
          response_style: persona?.tone || 'neutral',
          model_used: false,
          error: error instanceof Error ? error.message : String(error),
        },
        memory_update: undefined,
        next_actions: ['continue_conversation'],
      };
    }
  }
  
  // Health endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      agentId: config.id,
      agentName: config.name,
      timestamp: Date.now(),
      wsPort,
      wsEnabled: !!wsServer,
    });
  });
  
  // Heartbeat endpoint (for master to check worker health)
  app.get('/heartbeat', (req: Request, res: Response) => {
    res.json({
      agentId: config.id,
      agentName: config.name,
      status: 'alive',
      timestamp: Date.now(),
      tasks: Array.from(tasks.values()).map(t => ({
        id: t.id,
        status: t.status,
        tool: t.payload?.tool || 'unknown',
      })),
    });
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
  
  // Task submission
  app.post('/task', async (req: Request, res: Response) => {
    try {
      const { tool, params, context, taskId: requestedTaskId } = req.body;
      
      if (!tool) {
        return res.status(400).json({ error: 'tool name required' });
      }
      
      // Check if tool is allowed
      if (config.allowedTools.length > 0 && !config.allowedTools.includes(tool)) {
        return res.status(403).json({ 
          error: `Tool "${tool}" not allowed. Allowed: ${config.allowedTools.join(', ')}` 
        });
      }
      
      // Use requested task ID if provided, otherwise generate one
      const taskId = requestedTaskId || uuidv4();
      const task: AgentTask = {
        id: taskId,
        agentId: config.id,
        type: 'execute',
        payload: { tool, params, context },
        status: 'pending',
        created: Date.now(),
      };
      
      tasks.set(taskId, task);
      
      // Execute task in background
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
        message: 'Task queued for execution',
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
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json({
      taskId: task.id,
      status: task.status,
      created: task.created,
      started: task.started,
      completed: task.completed,
      error: task.error,
    });
  });
  
  // Task result
  app.get('/task/:id/result', (req: Request, res: Response) => {
    const taskId = req.params.id as string;
    const task = tasks.get(taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    if (task.status !== 'completed' && task.status !== 'failed') {
      return res.status(400).json({ 
        error: `Task not completed (status: ${task.status})` 
      });
    }
    
    res.json({
      taskId: task.id,
      status: task.status,
      result: task.result,
      error: task.error,
      completed: task.completed,
    });
  });
  
  // Cancel task
  app.post('/task/:id/cancel', (req: Request, res: Response) => {
    const taskId = req.params.id as string;
    const task = tasks.get(taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return res.status(400).json({ 
        error: `Cannot cancel task in status: ${task.status}` 
      });
    }
    
    task.status = 'cancelled';
    task.completed = Date.now();
    task.error = 'Cancelled by request';
    
    // Send cancellation event
    eventStream.sendTaskCancelled(taskId);
    
    res.json({
      taskId: task.id,
      status: 'cancelled',
      message: 'Task cancelled',
    });
  });
  
  // Event streaming endpoint (SSE)
  app.get('/events', createSSEHandler(eventStream));
  
  // Chat turn - conversational interaction (streaming)
  app.post('/chat', async (req: Request, res: Response) => {
    const turnId = uuidv4();
    
    try {
      const { speaker, target, message, context, mode = 'discussion' } = req.body as ChatRequest;
      
      if (!speaker || !target || !message) {
        return res.status(400).json({ error: 'speaker, target, and message required' });
      }
      
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
      
      // Send message start event
      eventStream.sendMessageStart(turnId, {
        name: persona.name,
        role: persona.role,
      });
      
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
        availableTools,
        (event) => {
          // Forward events to the event stream
          if (event.type === 'agent_message_start') {
            eventStream.sendMessageStart(event.turnId, event.persona);
          } else if (event.type === 'agent_message_delta') {
            eventStream.sendMessageDelta(event.turnId, event.delta);
          } else if (event.type === 'agent_message_end') {
            eventStream.sendMessageEnd(event.turnId, event.finalMessage);
          }
        }
      );
      
      let finalReply = reply;
      const executedActions: string[] = [];
      
      // Execute any tool calls the model requested
      if (toolCalls && toolCalls.length > 0) {
        log.info(`Executing ${toolCalls.length} tool calls from chat response`);
        
        for (const toolCall of toolCalls) {
          const { name, arguments: args } = toolCall;
          
          // Send tool started event
          eventStream.sendToolStarted(turnId, name, args, 'chat');
          
          // Execute tool
          const stream = executeToolWithStream(name, args, config.workspace, config.allowedTools, turn.context, (event) => {
            if (event.type === 'tool_started') {
              eventStream.sendToolStarted(turnId, event.toolName, event.params, 'chat');
            } else if (event.type === 'tool_stdout') {
              eventStream.sendToolStdout(turnId, event.data, 'chat');
            } else if (event.type === 'tool_stderr') {
              eventStream.sendToolStderr(turnId, event.data, 'chat');
            } else if (event.type === 'tool_finished') {
              eventStream.sendToolFinished(turnId, event.result, 'chat');
            }
          }, turnId, 'chat');  // Pass turnId as parentOperationId and type
          const result = await stream.result;
          
          // Send tool finished event
          eventStream.sendToolFinished(turnId, result, 'chat');
          
          if (result.success) {
            finalReply += `\n\n**Tool ${name} executed successfully:**\n${result.output}`;
            executedActions.push(`${name}: success`);
          } else {
            finalReply += `\n\n**Tool ${name} failed:** ${result.error}`;
            executedActions.push(`${name}: failed`);
          }
        }
      }
      
      // Update memory based on conversation
      const updatedMemory = updateMemoryFromConversation(memory, persona, turn, finalReply);
      saveMemory(config.workspace, updatedMemory);
      
      // Send message end event
      eventStream.sendMessageEnd(turnId, finalReply);
      
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
      
      // Send error event
      eventStream.sendMessageEnd(turnId, `Error: ${error instanceof Error ? error.message : String(error)}`);
      
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
        wsPort,
        app,
        close: () => {
          eventStream.destroy();
          server.close();
          if (wsServer) {
            wsServer.close();
          }
          log.info('Agent server stopped');
        },
      });
    });
    
    server.on('error', (error) => {
      log.error('Agent server failed to start:', error);
      reject(error);
    });
  });
}

/** Create agent identity from config */
export function createAgentIdentity(config: AgentConfig, port: number): AgentIdentity {
  // Filter capabilities based on platform
  let capabilities = config.allowedTools.length > 0 ? config.allowedTools : ['all'];
  
  // If search_files is included, check if it's actually supported
  if (capabilities.includes('search_files') || capabilities.includes('all')) {
    const searchCapabilities = getPlatformSearchCapabilities();
    if (!searchCapabilities.hasGrep && !searchCapabilities.hasRipgrep) {
      // Remove search_files from capabilities if grep/ripgrep not available
      if (config.allowedTools.length > 0) {
        capabilities = capabilities.filter(tool => tool !== 'search_files');
      }
      // Note: we still include it but will handle gracefully in execution
    }
  }
  
  // Check if persona exists for this agent
  let personaInfo = undefined;
  try {
    const persona = loadPersona(config.workspace);
    if (persona) {
      personaInfo = {
        loaded: true,
        name: persona.name,
        role: persona.role,
      };
    }
  } catch (error) {
    // Persona loading failed, continue without it
    log.debug(`Failed to load persona for agent ${config.id}:`, error);
  }
  
  return {
    id: config.id,
    name: config.name,
    type: 'local',
    status: 'idle',
    capabilities,
    endpoint: `http://localhost:${port}`,
    workspace: config.workspace,
    created: Date.now(),
    lastHeartbeat: Date.now(),
    platform: process.platform,
    platformCapabilities: {
      search: getPlatformSearchCapabilities(),
    },
    persona: personaInfo,
  };
}

