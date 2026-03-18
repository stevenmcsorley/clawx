/**
 * Agent Result Tool
 * 
 * Get task result.
 */

import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';

export const agentResultTool: ToolDefinition = {
  name: 'agent_result',
  label: 'Get Task Result',
  description: 'Get the result of a completed task',
  parameters: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'Task ID to get result for',
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
      
      if (task.status !== 'completed' && task.status !== 'failed') {
        return {
          content: [{
            type: 'text',
            text: `❌ Task not completed yet (status: ${task.status}). Use agent_status to check progress.`,
          }],
          details: { error: 'Task not completed', status: task.status },
          isError: true,
        };
      }
      
      const agent = registry.getAgent(task.agentId);
      
      let output = `## Task Result: ${taskId}\n\n`;
      output += `**Task Details:**\n`;
      output += `- ID: ${task.id}\n`;
      output += `- Agent: ${agent?.name || 'unknown'} (${task.agentId})\n`;
      output += `- Tool: ${task.payload.tool}\n`;
      output += `- Status: ${task.status}\n`;
      output += `- Created: ${new Date(task.created).toLocaleString()}\n`;
      output += `- Completed: ${new Date(task.completed!).toLocaleString()}\n`;
      
      if (task.error) {
        output += `- Error: ${task.error}\n`;
      }
      
      output += `\n**Result:**\n`;
      
      if (task.result) {
        // Format result content
        if (task.result.content && Array.isArray(task.result.content)) {
          for (const content of task.result.content) {
            if (content.type === 'text') {
              output += `${content.text}\n`;
            } else if (content.type === 'code') {
              output += `\`\`\`${content.language || ''}\n${content.code}\n\`\`\`\n`;
            }
          }
        }
        
        // Add details if available
        if (task.result.details && Object.keys(task.result.details).length > 0) {
          output += `\n**Details:**\n`;
          output += JSON.stringify(task.result.details, null, 2);
        }
      } else {
        output += `No result data available.\n`;
      }
      
      // If we don't have result but agent is reachable, try to fetch it
      if (!task.result && agent?.endpoint) {
        try {
          const response = await fetch(`${agent.endpoint}/task/${taskId}/result`);
          if (response.ok) {
            const agentResult: any = await response.json();
            output += `\n**Fetched from agent:**\n`;
            output += JSON.stringify(agentResult, null, 2);
            
            // Update local task
            if (agentResult.result) {
              task.result = agentResult.result;
              registry.updateTask(taskId, task);
              registry.save();
            }
          }
        } catch (error) {
          output += `\n**Note:** Could not fetch result from agent.\n`;
        }
      }
      
      return {
        content: [{ type: 'text', text: output }],
        details: {
          task_id: taskId,
          status: task.status,
          result: task.result,
          error: task.error,
          completed: task.completed,
        },
      };
      
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to get task result: ${error instanceof Error ? error.message : String(error)}`,
        }],
        details: { error: error instanceof Error ? error.message : String(error) },
        isError: true,
      };
    }
  },
};