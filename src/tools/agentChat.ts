/**
 * Agent Chat Tool with gRPC Streaming
 * 
 * Send a conversational turn from master to one worker and return the worker reply
 * Uses gRPC for live streaming of response
 */

import { ToolDefinition } from '../types/extension.js';
import { log } from '../utils/logger.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import type { ChatRequest, ChatResponse } from '../types/persona.js';
import { withGrpcWorkerStreaming } from '../utils/grpc-streaming-tool-helper.js';

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
    const agentId = params.agent_id;
    const agentName = params.agent_name;
    const message = params.message;
    const mode = params.mode || 'discussion';
    const conversationContext = params.context || {};
    
    // Determine which agent to chat with
    let identifier = agentId || agentName;
    if (!identifier) {
      return {
        content: [{
          type: 'text',
          text: '❌ Please specify either agent_id or agent_name',
        }],
        details: { error: 'Agent identifier required' },
        isError: true,
      };
    }
    
    try {
      const registry = new AgentRegistryManager();
      const agent = agentId 
        ? registry.getAgent(agentId)
        : registry.getAgentByName(agentName!);
      
      if (!agent) {
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
            },
            isError: true,
          };
        }
      } catch (healthError) {
        return {
          content: [{
            type: 'text',
            text: `❌ Agent "${agent.name}" is not reachable at ${agent.endpoint}`,
          }],
          details: { 
            error: 'Agent unreachable',
            agent_id: agent.id,
            agent_name: agent.name,
            endpoint: agent.endpoint,
            health_error: healthError instanceof Error ? healthError.message : String(healthError),
          },
          isError: true,
        };
      }
      
      // Generate a turn ID for this conversation
      const turnId = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Build chat request
      const chatRequest: ChatRequest = {
        speaker: 'master',
        target: agent.id,
        message,
        context: conversationContext,
        mode,
      };
      
      // Use gRPC streaming helper
      const streamingResult = await withGrpcWorkerStreaming({
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
          body: JSON.stringify({
            ...chatRequest,
            turnId, // Pass our turn ID for gRPC routing
          }),
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
      
      const { finalResult, events } = streamingResult;
      
      // Format response for display
      const reply = finalResult.response.reply || 'No reply received';
      const personaName = finalResult.persona?.name || agent.name;
      const personaRole = finalResult.persona?.role || 'Agent';
      
      return {
        content: [{
          type: 'text',
          text: `💬 ${personaName} (${personaRole}): ${reply}`,
        }],
        details: {
          agent_id: agent.id,
          agent_name: agent.name,
          turn_id: finalResult.turnId,
          persona: finalResult.persona,
          response: finalResult.response,
          events_count: events.length,
        },
      };
      
    } catch (error) {
      log.error('agent_chat failed:', error);
      
      return {
        content: [{
          type: 'text',
          text: `❌ Chat failed: ${error instanceof Error ? error.message : String(error)}`,
        }],
        details: { 
          error: 'Chat failed',
          error_details: error instanceof Error ? error.message : String(error),
        },
        isError: true,
      };
    }
  },
};