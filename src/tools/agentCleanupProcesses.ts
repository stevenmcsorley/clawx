/**
 * Agent Process Cleanup Tool
 * 
 * Clean up orphaned agent processes and stale registry entries
 */

import { ToolDefinition } from '../types/extension.js';
import { log } from '../utils/logger.js';
import { AgentRegistryManager } from '../core/agent-registry.js';

export const agentCleanupProcessesTool: ToolDefinition = {
  name: 'agent_cleanup_processes',
  label: 'Cleanup Agent Processes',
  description: 'Clean up orphaned agent processes and stale registry entries',
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
  },
  
  async execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any, context?: any) {
    const force = params.force || false;
    const cleanupThresholdMinutes = params.cleanup_threshold_minutes || 5;
    const cleanupThresholdMs = cleanupThresholdMinutes * 60 * 1000;
    
    try {
      const registry = new AgentRegistryManager();
      const agents = registry.getAgents();
      
      let cleanedCount = 0;
      let offlineCount = 0;
      const now = Date.now();
      
      // Check each agent
      for (const agent of agents) {
        // Skip self (master)
        if (agent.type === 'self') continue;
        
        // Check if agent is offline for too long
        const timeSinceLastHeartbeat = now - (agent.lastHeartbeat || agent.created);
        const isStale = timeSinceLastHeartbeat > cleanupThresholdMs;
        
        if (agent.status === 'offline' || isStale) {
          offlineCount++;
          
          if (force || isStale) {
            // Remove from registry
            registry.removeAgent(agent.id);
            cleanedCount++;
            
            log.info(`Cleaned up stale agent: ${agent.name} (${agent.id})`);
            
            if (onUpdate) {
              onUpdate({
                type: 'cleanup_progress',
                agentName: agent.name,
                agentId: agent.id,
                reason: isStale ? 'stale' : 'offline',
              });
            }
          }
        }
      }
      
      if (cleanedCount > 0) {
        registry.save();
      }
      
      const resultText = `🧹 Cleaned up ${cleanedCount} agent(s)\n` +
                        `📊 Found ${offlineCount} offline/stale agents\n` +
                        `⏱️ Threshold: ${cleanupThresholdMinutes} minutes\n` +
                        (force ? '🔧 Force mode: enabled' : '🔧 Force mode: disabled (use --force to clean all)');
      
      return {
        content: [{
          type: 'text',
          text: resultText,
        }],
        details: {
          cleaned_count: cleanedCount,
          offline_count: offlineCount,
          threshold_minutes: cleanupThresholdMinutes,
          force_mode: force,
        },
      };
      
    } catch (error) {
      log.error('agent_cleanup_processes failed:', error);
      
      return {
        content: [{
          type: 'text',
          text: `❌ Cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
        }],
        details: { 
          error: 'Cleanup failed',
          error_details: error instanceof Error ? error.message : String(error),
        },
        isError: true,
      };
    }
  },
};