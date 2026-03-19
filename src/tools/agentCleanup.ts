/**
 * Agent Cleanup Tool
 * 
 * Clean up stale/dead agents and tasks.
 */

import { ToolDefinition } from '../types/extension.js';
import { log } from '../utils/logger.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { cleanupStaleAgents, checkAgentHealth } from '../utils/agent-utils.js';

export const agentCleanupTool: ToolDefinition = {
  name: 'agent_cleanup',
  label: 'Clean Up Agents',
  description: 'Clean up stale/dead agents and tasks',
  parameters: {
    type: 'object',
    properties: {
      force: {
        type: 'boolean',
        description: 'Force cleanup without confirmation',
        default: false,
      },
      cleanup_threshold_minutes: {
        type: 'number',
        description: 'Cleanup threshold in minutes',
        default: 5,
      },
    },
    required: [],
  },
  
  async execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any, context?: any) {
    const force = params.force || false;
    const cleanupThresholdMinutes = params.cleanup_threshold_minutes || 5;
    
    try {
      const registry = new AgentRegistryManager();
      const agents = registry.getAgents();
      
      if (agents.length === 0) {
        return {
          content: [{ type: 'text', text: 'No agents in registry.' }],
        };
      }
      
      let output = `🧹 **Agent Cleanup**\n\n`;
      output += `Found ${agents.length} agents in registry.\n\n`;
      
      // Check agent health
      const healthChecks: Array<{
        agent: any;
        isHealthy: boolean;
        error?: string;
      }> = [];
      
      for (const agent of agents) {
        if (agent.type === 'self') {
          // Skip self agents
          healthChecks.push({ agent, isHealthy: true });
          continue;
        }
        
        try {
          const isHealthy = await checkAgentHealth(agent.endpoint!, 3000);
          healthChecks.push({ agent, isHealthy });
        } catch (error) {
          healthChecks.push({ 
            agent, 
            isHealthy: false, 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }
      
      // Identify dead agents
      const deadAgents = healthChecks.filter(check => !check.isHealthy);
      const liveAgents = healthChecks.filter(check => check.isHealthy);
      
      output += `**Health Check Results:**\n`;
      output += `- ✅ Live agents: ${liveAgents.length}\n`;
      output += `- ❌ Dead agents: ${deadAgents.length}\n\n`;
      
      if (deadAgents.length > 0) {
        output += `**Dead Agents:**\n`;
        for (const check of deadAgents) {
          output += `- ${check.agent.name} (${check.agent.id}) - ${check.error || 'Unreachable'}\n`;
        }
        output += `\n`;
      }
      
      // Clean up stale agents from registry
      const cleanedStale = cleanupStaleAgents(cleanupThresholdMinutes * 60 * 1000);
      output += `**Registry Cleanup:**\n`;
      output += `- Cleaned ${cleanedStale} stale agents\n\n`;
      
      // Clean up dead agents if confirmed
      let cleanedDead = 0;
      if (deadAgents.length > 0 && (force || deadAgents.length <= 3)) {
        // Auto-clean if force or small number
        for (const check of deadAgents) {
          registry.removeAgent(check.agent.id);
          cleanedDead++;
        }
        registry.save();
        output += `**Removed ${cleanedDead} dead agents from registry.**\n`;
      } else if (deadAgents.length > 0) {
        output += `**⚠️  Found ${deadAgents.length} dead agents.**\n`;
        output += `Use \`--force true\` to remove them, or run cleanup again.\n`;
      }
      
      // Clean up old tasks and stale running tasks tied to dead/offline agents
      const cleanedTasks = registry.cleanupOldTasks(24 * 60 * 60 * 1000, cleanupThresholdMinutes * 60 * 1000);
      if (cleanedTasks > 0) {
        registry.save();
        output += `**Cleaned ${cleanedTasks} old/stale tasks.**\n`;
      }
      
      output += `\n**Summary:**\n`;
      output += `- Total agents: ${agents.length}\n`;
      output += `- Live agents: ${liveAgents.length}\n`;
      output += `- Dead agents: ${deadAgents.length}\n`;
      output += `- Cleaned stale: ${cleanedStale}\n`;
      output += `- Cleaned dead: ${cleanedDead}\n`;
      output += `- Cleaned old tasks: ${cleanedTasks}\n`;
      
      return {
        content: [{ type: 'text', text: output }],
        details: {
          total_agents: agents.length,
          live_agents: liveAgents.length,
          dead_agents: deadAgents.length,
          cleaned_stale: cleanedStale,
          cleaned_dead: cleanedDead,
          cleaned_tasks: cleanedTasks,
        },
      };
      
    } catch (error) {
      log.error('Agent cleanup failed:', error);
      return {
        content: [{
          type: 'text',
          text: `❌ Agent cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
        }],
        details: { error: error instanceof Error ? error.message : String(error) },
        isError: true,
      };
    }
  },
};