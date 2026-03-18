/**
 * Agent Status Tool
 * 
 * Check task status.
 */

import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';

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
  
  async execute(params: any) {
    const taskId = params.task_id;
    
    try {
      const registry = new AgentRegistryManager();
      const task = registry.getTask(taskId);
      
      if (!task) {
        return {
          content: [{
            type: 'text',
            text: `❌ Task not found: ${taskId}`,
          }],
          details: { error: 'Task not found' },
          isError: true,
        };
      }
      
      const agent = registry.getAgent(task.agentId);
      
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