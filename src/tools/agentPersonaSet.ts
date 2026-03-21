/**
 * Agent Persona Set Tool
 * 
 * Write/replace persona card for an agent
 */

import { ToolDefinition } from '../types/extension.js';
import { log } from '../utils/logger.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { savePersona, createDefaultPersona, loadPersona } from '../utils/persona-utils.js';
import type { Persona } from '../types/persona.js';

export const agentPersonaSetTool: ToolDefinition = {
  name: 'agent_persona_set',
  label: 'Set Agent Persona',
  description: 'Write or replace persona card for an agent',
  parameters: {
    type: 'object',
    properties: {
      agent_id: {
        type: 'string',
        description: 'Agent ID to set persona for',
      },
      agent_name: {
        type: 'string',
        description: 'Agent name to set persona for (if ID not provided)',
      },
      name: {
        type: 'string',
        description: 'Persona display name',
      },
      role: {
        type: 'string',
        description: 'Persona role description',
      },
      tone: {
        type: 'string',
        description: 'Communication tone and style',
      },
      decision_style: {
        type: 'string',
        description: 'Decision-making style',
      },
      strengths: {
        type: 'array',
        description: 'Key strengths and capabilities',
        items: { type: 'string' },
      },
      biases: {
        type: 'array',
        description: 'Known biases or preferences',
        items: { type: 'string' },
      },
      goals: {
        type: 'array',
        description: 'Current goals or objectives',
        items: { type: 'string' },
      },
      boundaries: {
        type: 'array',
        description: 'Boundaries or constraints',
        items: { type: 'string' },
      },
      relationship_to_master: {
        type: 'string',
        description: 'Relationship to master/other agents',
      },
      notes: {
        type: 'string',
        description: 'Additional notes or instructions',
      },
      version: {
        type: 'string',
        description: 'Persona version',
        default: '1.0.0',
      },
      replace: {
        type: 'boolean',
        description: 'Replace existing persona completely (default: merge with existing)',
        default: false,
      },
    },
    required: [],
  },
  
  async execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any, context?: any) {
    log.debug('agent_persona_set toolCallId:', toolCallId);
    log.debug('agent_persona_set params:', params);
    
    // Normalize parameter names
    const normalizedParams = {
      agent_id: params.agent_id || params.agentId,
      agent_name: params.agent_name || params.agentName,
      name: params.name,
      role: params.role,
      tone: params.tone,
      decision_style: params.decision_style || params.decisionStyle,
      strengths: params.strengths || [],
      biases: params.biases || [],
      goals: params.goals || [],
      boundaries: params.boundaries || [],
      relationship_to_master: params.relationship_to_master || params.relationshipToMaster,
      notes: params.notes,
      version: params.version || '1.0.0',
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
                workspace: context?.workerWorkspace || context?.cwd || '',
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

    // Recover missing workspace metadata if needed
    if (!agent.workspace) {
      const registryWorkspace = registry.getAgentWorkspace(agent.id);
      agent.workspace = registryWorkspace;
      registry.upsertAgent(agent);
      registry.save();
    }
    
    // Load existing persona or create default
    const existingPersona = loadPersona(agent.workspace);
    let newPersona: Persona;
    
    if (normalizedParams.replace || !existingPersona) {
      // Create new persona from scratch or replace existing
      newPersona = createDefaultPersona(agent.id, agent.name);
    } else {
      // Start with existing persona
      newPersona = { ...existingPersona };
    }
    
    // Update fields if provided
    if (normalizedParams.name !== undefined) newPersona.name = normalizedParams.name;
    if (normalizedParams.role !== undefined) newPersona.role = normalizedParams.role;
    if (normalizedParams.tone !== undefined) newPersona.tone = normalizedParams.tone;
    if (normalizedParams.decision_style !== undefined) newPersona.decision_style = normalizedParams.decision_style;
    if (normalizedParams.strengths.length > 0) newPersona.strengths = normalizedParams.strengths;
    if (normalizedParams.biases.length > 0) newPersona.biases = normalizedParams.biases;
    if (normalizedParams.goals.length > 0) newPersona.goals = normalizedParams.goals;
    if (normalizedParams.boundaries.length > 0) newPersona.boundaries = normalizedParams.boundaries;
    if (normalizedParams.relationship_to_master !== undefined) newPersona.relationship_to_master = normalizedParams.relationship_to_master;
    if (normalizedParams.notes !== undefined) newPersona.notes = normalizedParams.notes;
    if (normalizedParams.version !== undefined) newPersona.version = normalizedParams.version;
    
    // Save the persona
    const success = savePersona(agent.workspace, newPersona);
    
    if (!success) {
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to save persona for agent "${agent.name}"`,
        }],
        details: { 
          error: 'Failed to save persona',
          agent_id: agent.id,
          agent_name: agent.name,
          workspace: agent.workspace,
        },
        isError: true,
      };
    }
    
    // Update agent in registry with persona info
    agent.persona = {
      loaded: true,
      name: newPersona.name,
      role: newPersona.role,
    };
    registry.upsertAgent(agent);
    registry.save();
    
    let output = `✅ Persona ${normalizedParams.replace ? 'replaced' : 'updated'} for agent "${agent.name}"\n\n`;
    output += `## ${newPersona.name}\n`;
    output += `**Role**: ${newPersona.role}\n`;
    output += `**Tone**: ${newPersona.tone}\n`;
    output += `**Decision Style**: ${newPersona.decision_style}\n`;
    output += `**Version**: ${newPersona.version}\n\n`;
    
    if (newPersona.strengths.length > 0) {
      output += `**Strengths**: ${newPersona.strengths.join(', ')}\n`;
    }
    
    if (newPersona.goals.length > 0) {
      output += `**Goals**: ${newPersona.goals.join(', ')}\n`;
    }
    
    output += `\n---\n`;
    output += `Workspace: ${agent.workspace}\n`;
    output += `Persona file: ${agent.workspace}/persona.json\n`;
    output += `Use \`agent_persona_show --agent_name "${agent.name}"\` to view full persona\n`;
    
    return {
      content: [{
        type: 'text',
        text: output,
      }],
      details: {
        agent_id: agent.id,
        agent_name: agent.name,
        persona_saved: true,
        persona_name: newPersona.name,
        persona_role: newPersona.role,
        version: newPersona.version,
        workspace: agent.workspace,
        replaced: normalizedParams.replace,
      },
    };
  },
};