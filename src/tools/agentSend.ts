/**
 * Agent Send Tool
 * 
 * Send a task to an agent.
 */

import { ToolDefinition } from '../types/extension.js';
import { log } from '../utils/logger.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { AgentTask } from '../types/agent.js';
import { v4 as uuidv4 } from 'uuid';

export const agentSendTool: ToolDefinition = {
  name: 'agent_send',
  label: 'Send Task to Agent',
  description: 'Send a task to a registered agent',
  parameters: {
    type: 'object',
    properties: {
      agent_id: {
        type: 'string',
        description: 'Agent ID to send task to',
      },
      agent_name: {
        type: 'string',
        description: 'Agent name to send task to (if ID not provided)',
      },
      tool: {
        type: 'string',
        description: 'Tool name to execute',
      },
      params: {
        type: 'object',
        description: 'Tool parameters',
        default: {},
      },
    },
    required: ['tool'],
  },
  
  async execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any, context?: any) {
    const agentId = params.agent_id;
    const agentName = params.agent_name;
    const tool = params.tool;
    const taskParams = params.params || {};
    
    try {
      const registry = new AgentRegistryManager();
      
      // Find agent
      let agent;
      if (agentId) {
        agent = registry.getAgent(agentId);
      } else if (agentName) {
        agent = registry.getAgentByName(agentName);
      }
      
      if (!agent) {
        return {
          content: [{
            type: 'text',
            text: `❌ Agent not found. Use agent_list to see available agents.`,
          }],
          details: { error: 'Agent not found' },
          isError: true,
        };
      }
      
      if (agent.status !== 'idle' && agent.status !== 'working') {
        return {
          content: [{
            type: 'text',
            text: `❌ Agent "${agent.name}" is not ready (status: ${agent.status}). Use agent_list to check status.`,
          }],
          details: { error: 'Agent not ready', status: agent.status },
          isError: true,
        };
      }
      
      if (!agent.endpoint) {
        return {
          content: [{
            type: 'text',
            text: `❌ Agent "${agent.name}" has no endpoint. It may not be running.`,
          }],
          details: { error: 'Agent has no endpoint' },
          isError: true,
        };
      }
      
      log.info(`Sending task to agent ${agent.name} (${agent.id}): ${tool}`);
      
      // Create task
      const taskId = uuidv4();
      const task: AgentTask = {
        id: taskId,
        agentId: agent.id,
        type: 'execute',
        payload: { tool, params: taskParams, context },
        status: 'pending',
        created: Date.now(),
      };
      
      registry.addTask(task);
      registry.save();
      
      // Send task to agent
      const response = await fetch(`${agent.endpoint}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool,
          params: taskParams,
          context,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Agent returned ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      
      // Update task with response
      task.status = 'running';
      task.started = Date.now();
      registry.updateTask(taskId, task);
      registry.save();
      
      const output = `✅ Task sent to agent "${agent.name}"\n\n` +
                    `**Task Details:**\n` +
                    `- Task ID: ${taskId}\n` +
                    `- Agent: ${agent.name} (${agent.id})\n` +
                    `- Tool: ${tool}\n` +
                    `- Status: running\n` +
                    `- Agent response: ${JSON.stringify(result, null, 2)}\n\n` +
                    `Use \`agent_status --task_id ${taskId}\` to check status.\n` +
                    `Use \`agent_result --task_id ${taskId}\` to get result.`;
      
      return {
        content: [{ type: 'text', text: output }],
        details: {
          task_id: taskId,
          agent_id: agent.id,
          agent_name: agent.name,
          tool,
          status: 'sent',
          agent_response: result,
        },
      };
      
    } catch (error) {
      log.error('Failed to send task to agent:', error);
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to send task: ${error instanceof Error ? error.message : String(error)}`,
        }],
        details: { error: error instanceof Error ? error.message : String(error) },
        isError: true,
      };
    }
  },
};