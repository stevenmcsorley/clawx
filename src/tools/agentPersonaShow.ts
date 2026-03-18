/**
 * Agent Persona Show Tool
 * 
 * Show persona card for an agent
 */

import { ToolDefinition } from '../types/extension.js';
import { log } from '../utils/logger.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { loadPersona, loadMemory, getRecentConversationTurns } from '../utils/persona-utils.js';

export const agentPersonaShowTool: ToolDefinition = {
  name: 'agent_persona_show',
  label: 'Show Agent Persona',
  description: 'Show persona card and memory for an agent',
  parameters: {
    type: 'object',
    properties: {
      agent_id: {
        type: 'string',
        description: 'Agent ID to show persona for',
      },
      agent_name: {
        type: 'string',
        description: 'Agent name to show persona for (if ID not provided)',
      },
      show_memory: {
        type: 'boolean',
        description: 'Show memory information',
        default: true,
      },
      show_conversation: {
        type: 'boolean',
        description: 'Show recent conversation turns',
        default: false,
      },
    },
    required: [],
  },
  
  async execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any, context?: any) {
    log.debug('agent_persona_show toolCallId:', toolCallId);
    log.debug('agent_persona_show params:', params);
    
    // Normalize parameter names
    const normalizedParams = {
      agent_id: params.agent_id || params.agentId,
      agent_name: params.agent_name || params.agentName,
      show_memory: params.show_memory !== undefined ? params.show_memory : true,
      show_conversation: params.show_conversation !== undefined ? params.show_conversation : false,
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
    
    // Load persona and memory
    const persona = loadPersona(agent.workspace);
    const memory = normalizedParams.show_memory ? loadMemory(agent.workspace) : null;
    const recentTurns = normalizedParams.show_conversation ? getRecentConversationTurns(agent.workspace, 5) : [];
    
    if (!persona) {
      return {
        content: [{
          type: 'text',
          text: `📝 Agent "${agent.name}" (${agent.id})\n\nNo persona file found.\nWorkspace: ${agent.workspace}\n\nUse agent_persona_set to create a persona for this agent.`,
        }],
        details: {
          agent_id: agent.id,
          agent_name: agent.name,
          persona_found: false,
          workspace: agent.workspace,
        },
      };
    }
    
    // Build output
    let output = `📝 Persona for "${agent.name}" (${agent.id})\n\n`;
    
    // Persona details
    output += `## ${persona.name}\n`;
    output += `**Role**: ${persona.role}\n`;
    output += `**Tone**: ${persona.tone}\n`;
    output += `**Decision Style**: ${persona.decision_style}\n`;
    output += `**Version**: ${persona.version}\n`;
    output += `**Updated**: ${new Date(persona.updatedAt).toLocaleString()}\n\n`;
    
    output += `### Strengths\n`;
    persona.strengths.forEach(strength => {
      output += `- ${strength}\n`;
    });
    output += `\n`;
    
    output += `### Biases\n`;
    persona.biases.forEach(bias => {
      output += `- ${bias}\n`;
    });
    output += `\n`;
    
    output += `### Goals\n`;
    persona.goals.forEach(goal => {
      output += `- ${goal}\n`;
    });
    output += `\n`;
    
    output += `### Boundaries\n`;
    persona.boundaries.forEach(boundary => {
      output += `- ${boundary}\n`;
    });
    output += `\n`;
    
    output += `### Relationship to Master\n`;
    output += `${persona.relationship_to_master}\n\n`;
    
    if (persona.notes) {
      output += `### Notes\n`;
      output += `${persona.notes}\n\n`;
    }
    
    // Memory information
    if (memory && normalizedParams.show_memory) {
      output += `## Memory\n`;
      output += `**Summary**: ${memory.summary}\n`;
      output += `**Updated**: ${new Date(memory.updatedAt).toLocaleString()}\n\n`;
      
      if (memory.key_facts.length > 0) {
        output += `### Key Facts\n`;
        memory.key_facts.forEach(fact => {
          output += `- ${fact}\n`;
        });
        output += `\n`;
      }
      
      if (memory.recent_context.length > 0) {
        output += `### Recent Context (last 3)\n`;
        memory.recent_context.slice(-3).forEach(context => {
          output += `- ${context}\n`;
        });
        output += `\n`;
      }
    }
    
    // Recent conversation
    if (recentTurns.length > 0 && normalizedParams.show_conversation) {
      output += `## Recent Conversation Turns (last 5)\n`;
      recentTurns.forEach(turn => {
        const time = new Date(turn.timestamp).toLocaleTimeString();
        const speaker = turn.speaker === agent.id ? 'Self' : turn.speaker;
        const target = turn.target === agent.id ? 'Self' : turn.target;
        output += `[${time}] ${speaker} → ${target}: ${turn.message.substring(0, 80)}${turn.message.length > 80 ? '...' : ''}\n`;
      });
      output += `\n`;
    }
    
    output += `---\n`;
    output += `Workspace: ${agent.workspace}\n`;
    output += `Persona file: ${agent.workspace}/persona.json\n`;
    if (normalizedParams.show_memory) {
      output += `Memory file: ${agent.workspace}/memory.json\n`;
    }
    if (normalizedParams.show_conversation) {
      output += `Conversation log: ${agent.workspace}/conversation-log.jsonl\n`;
    }
    
    return {
      content: [{
        type: 'text',
        text: output,
      }],
      details: {
        agent_id: agent.id,
        agent_name: agent.name,
        persona_found: true,
        persona_name: persona.name,
        persona_role: persona.role,
        memory_found: !!memory,
        recent_turns_count: recentTurns.length,
        workspace: agent.workspace,
      },
    };
  },
};