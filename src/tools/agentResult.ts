/**
 * Agent Result Tool
 * 
 * Get task result.
 */

import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';

function appendResultContent(output: string, value: any): string {
  if (!value) {
    return output;
  }

  if (value.content && Array.isArray(value.content)) {
    for (const content of value.content) {
      if (content.type === 'text') {
        output += `${content.text}\n`;
      } else if (content.type === 'code') {
        output += `\`\`\`${content.language || ''}\n${content.code}\n\`\`\`\n`;
      }
    }
    return output;
  }

  if (typeof value.output === 'string' && value.output.trim()) {
    output += `${value.output}\n`;
    return output;
  }

  if (value.result) {
    return appendResultContent(output, value.result);
  }

  if (typeof value === 'string') {
    output += `${value}\n`;
    return output;
  }

  output += `${JSON.stringify(value, null, 2)}\n`;
  return output;
}

function getResultDetails(value: any): any {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (value.details && Object.keys(value.details).length > 0) {
    return value.details;
  }

  if (value.result) {
    return getResultDetails(value.result);
  }

  return null;
}

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
        output = appendResultContent(output, task.result);

        const resultDetails = getResultDetails(task.result);
        if (resultDetails && Object.keys(resultDetails).length > 0) {
          output += `\n**Details:**\n`;
          output += JSON.stringify(resultDetails, null, 2);
        }
      } else {
        output += `No result data available.\n`;
      }
      
      const usesGrpcTransport = task.payload?.context?.__transport === 'grpc';

      // If we don't have result but agent is reachable, try to fetch it for HTTP-era tasks
      if (!usesGrpcTransport && !task.result && agent?.endpoint) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          // Use agent's task ID if available
          const agentTaskId = (task as any).agentTaskId || taskId;
          const response = await fetch(`${agent.endpoint}/task/${taskId}/result`, {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          
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