/**
 * Agent Chat Tool
 * 
 * Send a conversational turn from master to one worker and return the worker reply
 */

import { ToolDefinition } from '../types/extension.js';
import { log } from '../utils/logger.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { withWorkerStreaming } from '../utils/streaming-tool-helper.js';
import type { ChatRequest, ChatResponse } from '../types/persona.js';

export const agentChatTool: ToolDefinition = {
  name: 'agent_chat',
  label: 'Chat with Agent',
  description: 'Send a conversational turn to an agent and get their reply',
  parameters: {
    type: 'object',
    properties: {
      agent_id: {
        type: 'string',
        description: 'Agent ID to chat with',
      },
      agent_name: {
        type: 'string',
        description: 'Agent name to chat with (if ID not provided)',
      },
      message: {
        type: 'string',
        description: 'Message to send to the agent',
      },
      mode: {
        type: 'string',
        description: 'Conversation mode (discussion, task, brainstorm, etc.)',
        default: 'discussion',
      },
      context: {
        type: 'object',
        description: 'Optional context for the conversation',
        default: {},
      },
    },
    required: ['message'],
  },
  
  async execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any, context?: any) {
    log.debug('agent_chat toolCallId:', toolCallId);
    log.debug('agent_chat params:', params);
    
    // Normalize parameter names
    const normalizedParams = {
      agent_id: params.agent_id || params.agentId,
      agent_name: params.agent_name || params.agentName,
      message: params.message,
      mode: params.mode || 'discussion',
      context: params.context || {},
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
    
    if (!agent.endpoint) {
      return {
        content: [{
          type: 'text',
          text: `❌ Agent "${agent.name}" has no endpoint (status: ${agent.status})`,
        }],
        details: { 
          error: 'Agent has no endpoint',
          agent_id: agent.id,
          agent_name: agent.name,
          status: agent.status,
        },
        isError: true,
      };
    }
    
    // Check if agent is alive
    try {
      const healthResponse = await fetch(`${agent.endpoint}/health`, {
        signal: signal || AbortSignal.timeout(5000),
      });
      
      if (!healthResponse.ok) {
        return {
          content: [{
            type: 'text',
            text: `❌ Agent "${agent.name}" is not responding (health check failed)`,
          }],
          details: { 
            error: 'Agent health check failed',
            agent_id: agent.id,
            agent_name: agent.name,
            endpoint: agent.endpoint,
            status: agent.status,
          },
          isError: true,
        };
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Cannot connect to agent "${agent.name}" at ${agent.endpoint}`,
        }],
        details: { 
          error: 'Agent connection failed',
          agent_id: agent.id,
          agent_name: agent.name,
          endpoint: agent.endpoint,
          status: agent.status,
          connection_error: error instanceof Error ? error.message : String(error),
        },
        isError: true,
      };
    }
    
    // Prepare chat request
    const chatRequest: ChatRequest = {
      speaker: 'master',
      target: agent.id,
      message: normalizedParams.message,
      context: normalizedParams.context,
      mode: normalizedParams.mode,
    };
    
    log.info(`Sending chat to agent "${agent.name}" (${agent.id}): ${normalizedParams.message.substring(0, 100)}...`);
    
    try {
      // Generate a turn ID for streaming
      const turnId = `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      
      // Use streaming helper
      const streamingResult = await withWorkerStreaming({
        endpoint: agent.endpoint,
        agentId: agent.id,
        agentName: agent.name,
        operationId: turnId,
        operationType: 'chat',
        onUpdate: onUpdate,
        signal,
      }, async () => {
        // Send chat request
        const response = await fetch(`${agent.endpoint}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chatRequest),
          signal: signal || AbortSignal.timeout(30000), // 30 second timeout for chat
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Chat request failed (${response.status}): ${errorText}`);
        }
        
        const result = await response.json() as {
          success: boolean;
          turnId: string;
          response: ChatResponse;
          persona?: {
            name: string;
            role: string;
          };
        };
        
        if (!result.success) {
          throw new Error(`Chat failed: ${JSON.stringify(result)}`);
        }
        
        return result;
      });
      
      const result = streamingResult.finalResult;
      
      // Build final output summary
      const personaName = result.persona?.name || agent.name;
      const personaRole = result.persona?.role || 'Agent';
      
      let output = `\n---\n`;
      output += `💬 Conversation with ${personaName} (${personaRole})\n\n`;
      output += `**You**: ${normalizedParams.message}\n\n`;
      output += `**${personaName}**: ${result.response.reply}\n\n`;
      
      if (result.response.notes) {
        output += `---\n`;
        output += `**Notes**: ${JSON.stringify(result.response.notes, null, 2)}\n`;
      }
      
      if (result.response.next_actions && result.response.next_actions.length > 0) {
        output += `**Suggested next actions**: ${result.response.next_actions.join(', ')}\n`;
      }
      
      output += `\n---\n`;
      output += `Turn ID: ${result.turnId}\n`;
      output += `Mode: ${normalizedParams.mode}\n`;
      output += `Agent: ${agent.name} (${agent.id})\n`;
      
      return {
        content: [{
          type: 'text',
          text: output,
        }],
        details: {
          success: true,
          turn_id: result.turnId,
          agent_id: agent.id,
          agent_name: agent.name,
          persona_name: personaName,
          persona_role: personaRole,
          response: result.response,
          mode: normalizedParams.mode,
          events_received: streamingResult.events.length,
        },
      };
      
    } catch (error) {
      log.error('Chat request failed:', error);
      return {
        content: [{
          type: 'text',
          text: `❌ Chat request failed: ${error instanceof Error ? error.message : String(error)}`,
        }],
        details: { 
          error: 'Chat request failed',
          agent_id: agent.id,
          agent_name: agent.name,
          endpoint: agent.endpoint,
          chat_error: error instanceof Error ? error.message : String(error),
        },
        isError: true,
      };
    }
  },
};