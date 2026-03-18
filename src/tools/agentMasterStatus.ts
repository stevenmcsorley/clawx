/**
 * Agent Master Status Tool
 * 
 * Show current master status and agent network state.
 */

import { ToolDefinition } from '../types/extension.js';
import { log } from '../utils/logger.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { checkAgentHealth } from '../utils/agent-utils.js';
import { agentMaster } from '../core/agent-master.js';

export const agentMasterStatusTool: ToolDefinition = {
  name: 'agent_master_status',
  label: 'Master Status',
  description: 'Show current master status and agent network state',
  parameters: {
    type: 'object',
    properties: {
      check_health: {
        type: 'boolean',
        description: 'Check agent health status',
        default: true,
      },
    },
    required: [],
  },
  
  async execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any, context?: any) {
    const checkHealth = params.check_health !== false;
    
    try {
      const registry = new AgentRegistryManager();
      const agents = registry.getAgents();
      
      let output = `# 🎯 Clawx Agent Network Status\n\n`;
      
      // Check if this session is serving as master (using singleton)
      const isServing = agentMaster.isServing();
      const masterConfig = agentMaster.getConfig();
      
      output += `## Current Session\n`;
      if (isServing && masterConfig) {
        output += `✅ **Serving as master agent**\n`;
        output += `- Name: ${masterConfig.name}\n`;
        output += `- ID: ${masterConfig.id}\n`;
        output += `- Endpoint: http://localhost:${masterConfig.port}\n`;
        output += `- Workspace: ${masterConfig.workspace}\n`;
        output += `- Allowed tools: ${masterConfig.allowedTools.length > 0 ? masterConfig.allowedTools.join(', ') : 'all'}\n`;
      } else {
        output += `❌ **Not serving as master agent**\n`;
        output += `Use \`agent_serve\` to start as master.\n`;
      }
      
      output += `\n## Registry\n`;
      output += `- Path: ${registry.getRegistryPath()}\n`;
      output += `- Agents: ${agents.length}\n`;
      
      if (agents.length > 0) {
        output += `\n## Registered Agents\n`;
        
        // Group by type
        const selfAgents = agents.filter(a => a.type === 'self');
        const localAgents = agents.filter(a => a.type === 'local');
        const remoteAgents = agents.filter(a => a.type === 'remote');
        
        if (selfAgents.length > 0) {
          output += `\n### Self (${selfAgents.length})\n`;
          for (const agent of selfAgents) {
            const health = checkHealth && agent.endpoint ? await checkAgentHealth(agent.endpoint) : true;
            output += `- ${health ? '✅' : '❌'} **${agent.name}** (${agent.id})\n`;
            output += `  - Type: ${agent.type}\n`;
            output += `  - Status: ${agent.status}\n`;
            output += `  - Endpoint: ${agent.endpoint || 'none'}\n`;
            output += `  - Health: ${health ? 'reachable' : 'unreachable'}\n`;
            if (agent.capabilities && agent.capabilities.length > 0) {
              output += `  - Capabilities: ${agent.capabilities.join(', ')}\n`;
            }
          }
        }
        
        if (localAgents.length > 0) {
          output += `\n### Local Workers (${localAgents.length})\n`;
          for (const agent of localAgents) {
            const health = checkHealth && agent.endpoint ? await checkAgentHealth(agent.endpoint) : true;
            output += `- ${health ? '✅' : '❌'} **${agent.name}** (${agent.id})\n`;
            output += `  - Type: ${agent.type}\n`;
            output += `  - Status: ${agent.status}\n`;
            output += `  - Endpoint: ${agent.endpoint || 'none'}\n`;
            output += `  - Health: ${health ? 'reachable' : 'unreachable'}\n`;
            if (agent.capabilities && agent.capabilities.length > 0) {
              output += `  - Capabilities: ${agent.capabilities.join(', ')}\n`;
            }
          }
        }
        
        if (remoteAgents.length > 0) {
          output += `\n### Remote Workers (${remoteAgents.length})\n`;
          for (const agent of remoteAgents) {
            const health = checkHealth && agent.endpoint ? await checkAgentHealth(agent.endpoint) : true;
            output += `- ${health ? '✅' : '❌'} **${agent.name}** (${agent.id})\n`;
            output += `  - Type: ${agent.type}\n`;
            output += `  - Status: ${agent.status}\n`;
            output += `  - Endpoint: ${agent.endpoint || 'none'}\n`;
            output += `  - Health: ${health ? 'reachable' : 'unreachable'}\n`;
            if (agent.capabilities && agent.capabilities.length > 0) {
              output += `  - Capabilities: ${agent.capabilities.join(', ')}\n`;
            }
          }
        }
      } else {
        output += `\nNo agents registered.\n`;
      }
      
      output += `\n## Recommendations\n`;
      if (!isServing) {
        output += `1. Start as master: \`agent_serve --name master\`\n`;
      }
      if (agents.filter(a => a.type === 'local' || a.type === 'remote').length === 0) {
        output += `2. Spawn workers: \`agent_spawn_local --name worker1\`\n`;
      }
      output += `3. List agents: \`agent_list\`\n`;
      output += `4. Send tasks: \`agent_send --agent_name worker1 --tool search_files --pattern "TODO"\`\n`;
      output += `5. Clean up: \`agent_cleanup\`\n`;
      
      return {
        content: [{ type: 'text', text: output }],
        details: {
          is_serving: isServing,
          master_config: masterConfig,
          registry_path: registry.getRegistryPath(),
          agent_count: agents.length,
          self_agents: agents.filter(a => a.type === 'self').length,
          local_agents: agents.filter(a => a.type === 'local').length,
          remote_agents: agents.filter(a => a.type === 'remote').length,
        },
      };
      
    } catch (error) {
      log.error('Failed to get master status:', error);
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to get master status: ${error instanceof Error ? error.message : String(error)}`,
        }],
        details: { error: error instanceof Error ? error.message : String(error) },
        isError: true,
      };
    }
  },
};