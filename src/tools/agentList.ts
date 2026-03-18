/**
 * Agent List Tool
 * 
 * List registered agents.
 */

import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { checkAgentHealth } from '../utils/agent-utils.js';
import { log } from '../utils/logger.js';

export const agentListTool: ToolDefinition = {
  name: 'agent_list',
  label: 'List Agents',
  description: 'List all registered agents',
  parameters: {
    type: 'object',
    properties: {
      show_tasks: {
        type: 'boolean',
        description: 'Show recent tasks for each agent',
        default: false,
      },
      max_tasks: {
        type: 'number',
        description: 'Maximum tasks to show per agent',
        default: 5,
      },
      check_health: {
        type: 'boolean',
        description: 'Check agent health status',
        default: true,
      },
    },
    required: [],
  },
  
  async execute(params: any) {
    const showTasks = params.show_tasks || false;
    const maxTasks = params.max_tasks || 5;
    
    try {
      const registry = new AgentRegistryManager();
      const agents = registry.getAgents();
      
      if (agents.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No agents registered.\n\nUse agent_serve to make this instance a networked agent.\nUse agent_spawn_local to spawn worker agents.',
          }],
          details: { agent_count: 0 },
        };
      }
      
      let output = `## Registered Agents (${agents.length})\n\n`;
      
      for (const agent of agents) {
        output += `### ${agent.name} (${agent.type})\n`;
        output += `- **ID**: ${agent.id}\n`;
        output += `- **Status**: ${agent.status}\n`;
        
        if (agent.endpoint) {
          output += `- **Endpoint**: ${agent.endpoint}\n`;
        }
        
        output += `- **Workspace**: ${agent.workspace}\n`;
        output += `- **Created**: ${new Date(agent.created).toLocaleString()}\n`;
        
        if (agent.lastHeartbeat) {
          const age = Date.now() - agent.lastHeartbeat;
          output += `- **Last heartbeat**: ${Math.floor(age / 1000)}s ago\n`;
        }
        
        if (agent.capabilities.length > 0) {
          output += `- **Capabilities**: ${agent.capabilities.join(', ')}\n`;
        } else {
          output += `- **Capabilities**: all\n`;
        }
        
        if (showTasks) {
          const tasks = registry.getAgentTasks(agent.id);
          const recentTasks = tasks
            .sort((a, b) => b.created - a.created)
            .slice(0, maxTasks);
          
          if (recentTasks.length > 0) {
            output += `- **Recent tasks**:\n`;
            for (const task of recentTasks) {
              const age = Date.now() - task.created;
              output += `  • ${task.id.substring(0, 8)}: ${task.payload.tool} (${task.status}, ${Math.floor(age / 1000)}s ago)\n`;
            }
          }
        }
        
        output += '\n';
      }
      
      // Add registry info
      const tasks = registry.getTasks();
      const pending = tasks.filter(t => t.status === 'pending' || t.status === 'running').length;
      const completed = tasks.filter(t => t.status === 'completed').length;
      const failed = tasks.filter(t => t.status === 'failed' || t.status === 'cancelled').length;
      
      output += `## Registry Summary\n`;
      output += `- **Total agents**: ${agents.length}\n`;
      output += `- **Total tasks**: ${tasks.length}\n`;
      output += `- **Pending/running**: ${pending}\n`;
      output += `- **Completed**: ${completed}\n`;
      output += `- **Failed/cancelled**: ${failed}\n`;
      output += `- **Registry path**: ${registry.getRegistryPath()}\n`;
      
      return {
        content: [{ type: 'text', text: output }],
        details: {
          agent_count: agents.length,
          task_count: tasks.length,
          agents: agents.map(a => ({
            id: a.id,
            name: a.name,
            type: a.type,
            status: a.status,
            endpoint: a.endpoint,
          })),
        },
      };
      
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to list agents: ${error instanceof Error ? error.message : String(error)}`,
        }],
        details: { error: error instanceof Error ? error.message : String(error) },
        isError: true,
      };
    }
  },
};