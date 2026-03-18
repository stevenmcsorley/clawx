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
import { createSearchFilesTool } from '../tools/searchFiles.js';
import { createGitStatusTool } from '../tools/gitStatus.js';
import { createGitDiffTool } from '../tools/gitDiff.js';
import { createSshRunTool } from '../tools/sshRun.js';
import { getPlatformSearchCapabilities } from '../utils/search-utils.js';

export interface AgentServer {
  port: number;
  app: express.Application;
  close: () => void;
}

export async function startAgentServer(config: AgentConfig): Promise<AgentServer> {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  
  const server = createServer(app);
  const tasks = new Map<string, AgentTask>();
  
  /** Execute a task with real tool with timeout */
  async function executeTask(taskId: string, tool: string, params: any, context: any): Promise<void> {
    const task = tasks.get(taskId);
    if (!task) return;
    
    task.status = 'running';
    task.started = Date.now();
    
    // Set up timeout
    const timeoutMs = 2 * 60 * 1000; // 2 minutes default timeout (shorter for agents)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Task timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    
    try {
      // Get the appropriate tool
      let toolDefinition;
      // Use current directory from context, or workspace as fallback
      const cwd = context?.cwd || config.workspace;
      
      // Basic tools that agents can execute
      switch (tool) {
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
        default:
          throw new Error(`Tool not supported by agent: ${tool}. Agents only support: search_files, git_status, git_diff, ssh_run`);
      }
      
      // Execute the tool with timeout
      const result = await Promise.race([
        toolDefinition.execute(taskId, params, context),
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
  
  // Health endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      agentId: config.id,
      agentName: config.name,
      timestamp: Date.now(),
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
      const { tool, params, context } = req.body;
      
      if (!tool) {
        return res.status(400).json({ error: 'tool name required' });
      }
      
      // Check if tool is allowed
      if (config.allowedTools.length > 0 && !config.allowedTools.includes(tool)) {
        return res.status(403).json({ 
          error: `Tool "${tool}" not allowed. Allowed: ${config.allowedTools.join(', ')}` 
        });
      }
      
      const taskId = uuidv4();
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
    
    res.json({
      taskId: task.id,
      status: 'cancelled',
      message: 'Task cancelled',
    });
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
        app,
        close: () => {
          server.close();
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
  };
}

