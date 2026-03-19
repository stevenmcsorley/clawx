/**
 * Agent Status Tool
 * 
 * Check task status.
 */

import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { log } from '../utils/logger.js';

export const agentStatusTool: ToolDefinition = {
  name: 'agent_status',
  label: 'Check Task Status',
  description: 'Check the status of a task sent to an agent',
  parameters: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'Task ID to check',
      },
    },
    required: ['task_id'],
  },
  
  async execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any, context?: any) {
    const taskId = params.task_id;
    
    if (!taskId || typeof taskId !== 'string') {
      return {
        content: [{
          type: 'text',
          text: '❌ Task ID is required and must be a string',
        }],
        details: { error: 'Task ID required' },
        isError: true,
      };
    }
    
    try {
      const registry = new AgentRegistryManager();
      const task = registry.getTask(taskId);
      
      if (!task) {
        return {
          content: [{
            type: 'text',
            text: `❌ Task not found in registry: ${taskId}`,
          }],
          details: { error: 'Task not found in registry' },
          isError: true,
        };
      }
      
      const agent = registry.getAgent(task.agentId);
      
      if (!agent || !agent.endpoint) {
        return {
          content: [{
            type: 'text',
            text: `❌ Agent not found or has no endpoint for task ${taskId}`,
          }],
          details: { error: 'Agent not found', taskId, agentId: task.agentId },
          isError: true,
        };
      }
      
      // Query agent for actual task status
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(`${agent.endpoint}/task/${taskId}/status`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const agentStatus: any = await response.json();
          
          // Update registry with latest status
          task.status = agentStatus.status;
          task.started = agentStatus.started;
          task.completed = agentStatus.completed;
          task.error = agentStatus.error;
          registry.updateTask(taskId, task);
          registry.save();
        }
      } catch (error) {
        // Agent might be offline, use registry status
        console.warn(`Could not query agent for task status: ${error}`);
      }
      
      let output = `## Task Status: ${taskId}\n\n`;
      output += `**Task Details:**\n`;
      output += `- ID: ${task.id}\n`;
      output += `- Agent: ${agent?.name || 'unknown'} (${task.agentId})\n`;
      output += `- Tool: ${task.payload.tool}\n`;
      output += `- Status: ${task.status}\n`;
      output += `- Created: ${new Date(task.created).toLocaleString()}\n`;
      
      if (task.started) {
        output += `- Started: ${new Date(task.started).toLocaleString()}\n`;
      }
      
      if (task.completed) {
        output += `- Completed: ${new Date(task.completed).toLocaleString()}\n`;
      }
      
      if (task.error) {
        output += `- Error: ${task.error}\n`;
      }
      
      // If task is pending/running, try to get status from agent
      if ((task.status === 'pending' || task.status === 'running') && agent?.endpoint) {
        try {
          const response = await fetch(`${agent.endpoint}/task/${taskId}/status`);
          if (response.ok) {
            const agentStatus: any = await response.json();
            output += `\n**Agent Status:**\n`;
            output += `- Agent status: ${agentStatus.status}\n`;
            output += `- Agent endpoint: ${agent.endpoint}\n`;
            
            // Update local task status if different
            if (agentStatus.status !== task.status) {
              task.status = agentStatus.status;
              registry.updateTask(taskId, task);
              registry.save();
            }
          }
        } catch (error) {
          output += `\n**Note:** Could not reach agent for live status.\n`;
        }
      }
      
      output += `\nUse \`agent_result --task_id ${taskId}\` to get the result.`;
      
      return {
        content: [{ type: 'text', text: output }],
        details: {
          task_id: taskId,
          status: task.status,
          agent_id: task.agentId,
          tool: task.payload.tool,
          created: task.created,
          started: task.started,
          completed: task.completed,
          error: task.error,
        },
      };
      
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to check task status: ${error instanceof Error ? error.message : String(error)}`,
        }],
        details: { error: error instanceof Error ? error.message : String(error) },
        isError: true,
      };
    }
  },
};