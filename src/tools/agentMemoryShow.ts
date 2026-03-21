/**
 * Agent Memory Show Tool
 * 
 * Show current memory summary for an agent
 */

import { ToolDefinition } from '../types/extension.js';
import { log } from '../utils/logger.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { loadMemory, getRecentConversationTurns } from '../utils/persona-utils.js';

export const agentMemoryShowTool: ToolDefinition = {
  name: 'agent_memory_show',
  label: 'Show Agent Memory',
  description: 'Show memory summary and recent context for an agent',
  parameters: {
    type: 'object',
    properties: {
      agent_id: {
        type: 'string',
        description: 'Agent ID to show memory for',
      },
      agent_name: {
        type: 'string',
        description: 'Agent name to show memory for (if ID not provided)',
      },
      recent_turns: {
        type: 'number',
        description: 'Number of recent conversation turns to show',
        default: 10,
      },
    },
    required: [],
  },
  
  async execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any, context?: any) {
    log.debug('agent_memory_show toolCallId:', toolCallId);
    log.debug('agent_memory_show params:', params);
    
    // Normalize parameter names
    const normalizedParams = {
      agent_id: params.agent_id || params.agentId,
      agent_name: params.agent_name || params.agentName,
      recent_turns: params.recent_turns || params.recentTurns || 10,
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
    
    if (!agent && normalizedParams.agent_id) {
      const resolvedWorkerName = context?.remoteWorkerName;
      const masterEndpoint = context?.masterEndpoint || `http://localhost:${context?.port || ''}`;
      if (resolvedWorkerName && masterEndpoint) {
        try {
          const response = await fetch(`${masterEndpoint}/agents`);
          if (response.ok) {
            const connectedAgents = await response.json() as any[];
            const connected = connectedAgents.find((candidate: any) => candidate?.id === normalizedParams.agent_id || candidate?.name === resolvedWorkerName);
            if (connected?.id) {
              agent = {
                id: connected.id,
                name: connected.name || resolvedWorkerName,
                type: 'local',
                status: 'idle',
                capabilities: connected.capabilities || [],
                endpoint: connected.endpoint,
                workspace: (context?.masterWorkspace && resolvedWorkerName ? `${context.masterWorkspace.replace(/\\/g, '/')}/../${normalizedParams.agent_id}` : '') || context?.workerWorkspace || context?.cwd || '',
                created: Date.now(),
                lastHeartbeat: Date.now(),
              } as any;
            }
          }
        } catch {}
      }
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
    
    // Load memory and recent conversation
    const memory = loadMemory(agent.workspace);
    const recentTurns = getRecentConversationTurns(agent.workspace, normalizedParams.recent_turns);
    
    if (!memory) {
      return {
        content: [{
          type: 'text',
          text: `🧠 Agent "${agent.name}" (${agent.id})\n\nNo memory file found.\nWorkspace: ${agent.workspace}\n\nMemory will be created automatically during conversations.`,
        }],
        details: {
          agent_id: agent.id,
          agent_name: agent.name,
          memory_found: false,
          workspace: agent.workspace,
        },
      };
    }
    
    // Build output
    let output = `🧠 Memory for "${agent.name}" (${agent.id})\n\n`;
    
    output += `## Summary\n`;
    output += `${memory.summary}\n\n`;
    
    output += `**Updated**: ${new Date(memory.updatedAt).toLocaleString()}\n\n`;
    
    if (memory.key_facts.length > 0) {
      output += `## Key Facts\n`;
      memory.key_facts.forEach(fact => {
        output += `- ${fact}\n`;
      });
      output += `\n`;
    }
    
    if (memory.recent_context.length > 0) {
      output += `## Recent Context\n`;
      memory.recent_context.forEach(context => {
        output += `- ${context}\n`;
      });
      output += `\n`;
    }
    
    if (recentTurns.length > 0) {
      output += `## Recent Conversation Turns (last ${normalizedParams.recent_turns})\n`;
      recentTurns.forEach(turn => {
        const time = new Date(turn.timestamp).toLocaleTimeString();
        const speaker = turn.speaker === agent.id ? 'Self' : turn.speaker.substring(0, 8) + '...';
        const target = turn.target === agent.id ? 'Self' : turn.target.substring(0, 8) + '...';
        const messagePreview = turn.message.length > 60 
          ? turn.message.substring(0, 60) + '...' 
          : turn.message;
        output += `[${time}] ${speaker} → ${target}: ${messagePreview}\n`;
      });
      output += `\n`;
    }
    
    output += `---\n`;
    output += `Workspace: ${agent.workspace}\n`;
    output += `Memory file: ${agent.workspace}/memory.json\n`;
    output += `Conversation log: ${agent.workspace}/conversation-log.jsonl\n`;
    output += `Use \`agent_persona_show --agent_name "${agent.name}"\` to see persona details\n`;
    
    return {
      content: [{
        type: 'text',
        text: output,
      }],
      details: {
        agent_id: agent.id,
        agent_name: agent.name,
        memory_found: true,
        memory_summary: memory.summary,
        key_facts_count: memory.key_facts.length,
        recent_context_count: memory.recent_context.length,
        recent_turns_count: recentTurns.length,
        workspace: agent.workspace,
      },
    };
  },
};