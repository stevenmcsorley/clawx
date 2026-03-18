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

export interface AgentServer {
  port: number;
  close: () => void;
}

export async function startAgentServer(config: AgentConfig): Promise<AgentServer> {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  
  const server = createServer(app);
  const tasks = new Map<string, AgentTask>();
  
  // Health endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      agentId: config.id,
      agentName: config.name,
      timestamp: Date.now(),
    });
  });
  
  // Register with master
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
      
      // TODO: Actually execute task
      // For now, simulate execution
      setTimeout(() => {
        const storedTask = tasks.get(taskId);
        if (storedTask) {
          storedTask.status = 'completed';
          storedTask.started = Date.now();
          storedTask.completed = Date.now();
          storedTask.result = {
            content: [{ type: 'text', text: `Task ${taskId} completed (simulated)` }],
            details: { simulated: true, tool, timestamp: Date.now() },
          };
        }
      }, 100);
      
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
  return {
    id: config.id,
    name: config.name,
    type: 'local',
    status: 'idle',
    capabilities: config.allowedTools.length > 0 ? config.allowedTools : ['all'],
    endpoint: `http://localhost:${port}`,
    workspace: config.workspace,
    created: Date.now(),
    lastHeartbeat: Date.now(),
  };
}