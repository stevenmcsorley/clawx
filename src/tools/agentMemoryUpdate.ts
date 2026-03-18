/**
 * Agent Memory Update Tool
 * 
 * Save/replace memory summary for an agent
 */

import { ToolDefinition } from '../types/extension.js';
import { log } from '../utils/logger.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { saveMemory, loadMemory, createDefaultMemory } from '../utils/persona-utils.js';
import type { Memory } from '../types/persona.js';

export const agentMemoryUpdateTool: ToolDefinition = {
  name: 'agent_memory_update',
  label: 'Update Agent Memory',
  description: 'Save or replace memory summary for an agent',
  parameters: {
    type: 'object',
    properties: {
      agent_id: {
        type: 'string',
        description: 'Agent ID to update memory for',
      },
      agent_name: {
        type: 'string',
        description: 'Agent name to update memory for (if ID not provided)',
      },
      summary: {
        type: 'string',
        description: 'New memory summary',
      },
      key_facts: {
        type: 'array',
        description: 'Key facts or knowledge to remember',
        items: { type: 'string' },
      },
      recent_context: {
        type: 'array',
        description: 'Recent conversation context',
        items: { type: 'string' },
      },
      replace: {
        type: 'boolean',
        description: 'Replace memory completely (default: merge with existing)',
        default: false,
      },
    },
    required: [],
  },
  
  async execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any, context?: any) {
    log.debug('agent_memory_update toolCallId:', toolCallId);
    log.debug('agent_memory_update params:', params);
    
    // Normalize parameter names
    const normalizedParams = {
      agent_id: params.agent_id || params.agentId,
      agent_name: params.agent_name || params.agentName,
      summary: params.summary,
      key_facts: params.key_facts || params.keyFacts || [],
      recent_context: params.recent_context || params.recentContext || [],
      replace: params.replace || false,
    };
    
    const registry = new AgentRegistryManager();
    
    // Find agent by ID or name
    let agent;
    if (normalizedParams.agent_id) {
      agent = registry.getAgent(normalizedParams.agent_id);
    } else if (normalizedParams.agent_name) {
      agent = registry.getAgentByName(normalizedParams.agent_name);
    } else {
      return {
        content: [{
          type: 'text',
          text: '❌ Please specify either agent_id or agent_name',
        }],
        details: { error: 'Missing agent identifier' },
        isError: true,
      };
    }
    
    if (!agent) {
      const identifier = normalizedParams.agent_id || normalizedParams.agent_name;
      return {
        content: [{
          type: 'text',
          text: `❌ Agent not found: ${identifier}`,
        }],
        details: { error: 'Agent not found', identifier },
        isError: true,
      };
    }
    
    // Load existing memory or create default
    const existingMemory = loadMemory(agent.workspace);
    let newMemory: Memory;
    
    if (normalizedParams.replace || !existingMemory) {
      // Create new memory from scratch or replace existing
      newMemory = createDefaultMemory();
    } else {
      // Start with existing memory
      newMemory = { ...existingMemory };
    }
    
    // Update fields if provided
    if (normalizedParams.summary !== undefined) newMemory.summary = normalizedParams.summary;
    if (normalizedParams.key_facts.length > 0) newMemory.key_facts = normalizedParams.key_facts;
    if (normalizedParams.recent_context.length > 0) newMemory.recent_context = normalizedParams.recent_context;
    
    // Save the memory
    const success = saveMemory(agent.workspace, newMemory);
    
    if (!success) {
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to save memory for agent "${agent.name}"`,
        }],
        details: { 
          error: 'Failed to save memory',
          agent_id: agent.id,
          agent_name: agent.name,
          workspace: agent.workspace,
        },
        isError: true,
      };
    }
    
    let output = `✅ Memory ${normalizedParams.replace ? 'replaced' : 'updated'} for agent "${agent.name}"\n\n`;
    
    output += `## Summary\n`;
    output += `${newMemory.summary}\n\n`;
    
    if (newMemory.key_facts.length > 0) {
      output += `## Key Facts (${newMemory.key_facts.length})\n`;
      newMemory.key_facts.slice(0, 5).forEach(fact => {
        output += `- ${fact}\n`;
      });
      if (newMemory.key_facts.length > 5) {
        output += `... and ${newMemory.key_facts.length - 5} more\n`;
      }
      output += `\n`;
    }
    
    if (newMemory.recent_context.length > 0) {
      output += `## Recent Context (${newMemory.recent_context.length})\n`;
      newMemory.recent_context.slice(-3).forEach(context => {
        output += `- ${context}\n`;
      });
      if (newMemory.recent_context.length > 3) {
        output += `... and ${newMemory.recent_context.length - 3} more\n`;
      }
      output += `\n`;
    }
    
    output += `---\n`;
    output += `Updated: ${new Date(newMemory.updatedAt).toLocaleString()}\n`;
    output += `Workspace: ${agent.workspace}\n`;
    output += `Memory file: ${agent.workspace}/memory.json\n`;
    output += `Use \`agent_memory_show --agent_name "${agent.name}"\` to view memory\n`;
    
    return {
      content: [{
        type: 'text',
        text: output,
      }],
      details: {
        agent_id: agent.id,
        agent_name: agent.name,
        memory_saved: true,
        memory_summary: newMemory.summary,
        key_facts_count: newMemory.key_facts.length,
        recent_context_count: newMemory.recent_context.length,
        workspace: agent.workspace,
        replaced: normalizedParams.replace,
      },
    };
  },
};