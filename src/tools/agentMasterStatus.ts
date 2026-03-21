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
      registry.markOfflineAgents();
      registry.cleanupOldTasks();
      registry.save();
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
            if (agent.persona?.loaded) {
              output += `  - Persona: ${agent.persona.name} — ${agent.persona.role}\n`;
            }
            if (agent.capabilities && agent.capabilities.length > 0) {
              output += `  - Capabilities: ${agent.capabilities.join(', ')}\n`;
            }
            output += `  - Quick chat: agent_chat --agent_name ${agent.name} --message \"Help me with ...\"\n`;
            output += `  - Quick task: agent_send --agent_name ${agent.name} --tool ls --params {}\n`;
          }
        }
        
        if (remoteAgents.length > 0) {
          output += `\n### Remote Peer Masters (${remoteAgents.length})\n`;
          for (const agent of remoteAgents) {
            const health = checkHealth && agent.endpoint ? await checkAgentHealth(agent.endpoint) : true;
            const effectiveStatus = health ? 'idle' : 'offline';
            if (agent.status !== effectiveStatus) {
              agent.status = effectiveStatus as any;
              agent.lastHeartbeat = Date.now();
              registry.upsertAgent(agent);
            }
            output += `- ${health ? '✅' : '❌'} **${agent.name}** (${agent.id})\n`;
            output += `  - Type: ${agent.type}\n`;
            output += `  - Status: ${effectiveStatus}\n`;
            output += `  - Endpoint: ${agent.endpoint || 'none'}\n`;
            output += `  - Health: ${health ? 'reachable' : 'unreachable'}\n`;
            if (agent.persona?.loaded) {
              output += `  - Role: ${agent.persona.role || 'remote peer master'}\n`;
            }
            if (agent.capabilities && agent.capabilities.length > 0) {
              output += `  - Capabilities: ${agent.capabilities.join(', ')}\n`;
            }
            output += `  - Peer chat: agent_peer_chat --peer_name ${agent.name} --message \"Hello from this master\"\n`;
            output += `  - Peer task: agent_peer_send --peer_name ${agent.name} --tool ls --params {}\n`;
          }
        }
      } else {
        output += `\nNo agents registered.\n`;
      }
      
      const localWorkers = agents.filter(a => a.type === 'local');
      const remotePeers = agents.filter(a => a.type === 'remote');
      output += `\n## Collaboration Guide\n`;
      const guideLines: string[] = [];
      if (!isServing) {
        guideLines.push('Start as master: `agent_serve --name master`');
      }
      if (localWorkers.length === 0) {
        guideLines.push('Spawn a local worker: `agent_spawn_local --name worker1`');
      } else {
        guideLines.push('Inspect local workers/personas here before delegating');
        guideLines.push(`Ask a local worker directly: \`agent_chat --agent_name ${localWorkers[0].name} --message "Review this approach"\``);
        guideLines.push(`Delegate a local tool task: \`agent_send --agent_name ${localWorkers[0].name} --tool ls --params {}\``);
      }
      if (remotePeers.length === 0) {
        guideLines.push('Register a LAN peer master: `agent_peer_add --name ubuntu-master --endpoint http://host:43210`');
      } else {
        guideLines.push(`Chat with a peer master: \`agent_peer_chat --peer_name ${remotePeers[0].name} --message "Hello from this master"\``);
        guideLines.push(`List workers behind a peer: \`agent_peer_list_workers --peer_name ${remotePeers[0].name}\``);
        guideLines.push(`Delegate to a peer worker: \`agent_peer_send --peer_name ${remotePeers[0].name} --worker_name <worker> --tool ls --params {}\``);
      }
      guideLines.push('List agents: `agent_list`');
      guideLines.push('Clean up: `agent_cleanup`');
      guideLines.forEach((line, index) => {
        output += `${index + 1}. ${line}\n`;
      });
      
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