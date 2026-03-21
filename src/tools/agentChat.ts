/**
 * Agent Chat Tool with gRPC Streaming
 * 
 * Send a conversational turn from master to one worker and return the worker reply
 * Uses gRPC for live streaming of response
 */

import { ToolDefinition } from '../types/extension.js';
import { log } from '../utils/logger.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { agentMaster } from '../core/agent-master.js';
import type { ChatResponse } from '../types/persona.js';
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
      let agent = agentId 
        ? registry.getAgent(agentId)
        : registry.getAgentByName(agentName!);
      
      if (!agent && agentId) {
        const resolvedWorkerName = context?.remoteWorkerName;
        const masterEndpoint = context?.masterEndpoint || `http://localhost:${context?.port || ''}`;
        if (resolvedWorkerName && masterEndpoint) {
          try {
            const response = await fetch(`${masterEndpoint}/agents`);
            if (response.ok) {
              const connectedAgents = await response.json() as any[];
              const connected = connectedAgents.find((candidate: any) => candidate?.id === agentId || candidate?.name === resolvedWorkerName);
              if (connected?.id) {
                agent = {
                  id: connected.id,
                  name: connected.name || resolvedWorkerName,
                  type: 'local',
                  status: 'idle',
                  capabilities: connected.capabilities || [],
                  endpoint: connected.endpoint,
                  workspace: (context?.masterWorkspace && resolvedWorkerName ? `${context.masterWorkspace.replace(/\\/g, '/')}/../${agentId}` : '') || context?.workerWorkspace || context?.cwd || '',
                  created: Date.now(),
                  lastHeartbeat: Date.now(),
                } as any;
              }
            }
          } catch {}
        }
      }

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
      
      const allowConnectedAgentWithoutEndpoint = !agent.endpoint && !!context?.remoteWorkerName;
      if (!agent.endpoint && !allowConnectedAgentWithoutEndpoint) {
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
      
      // Check if agent is alive when an endpoint exists. For peer-executed connected workers,
      // a live gRPC connection on the peer master is enough even if no worker HTTP endpoint is exposed.
      if (agent.endpoint) {
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
      }
      
      // Generate a turn ID for this conversation
      const turnId = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      const activeMasterConfig = context?.__activeMasterConfig;
      const activeGrpcServer = context?.__activeGrpcServer;
      const masterServer = agentMaster.getServer();
      const masterConfig = activeMasterConfig || agentMaster.getConfig();
      const grpcServer = activeGrpcServer || (masterServer?.grpcServer as any);
      const grpcPort = activeMasterConfig?.port ? activeMasterConfig.port + 2000 : masterServer?.grpcPort;
      if (!grpcPort || !masterConfig || !grpcServer?.sendChat) {
        throw new Error('Current session does not have an active gRPC master server instance');
      }

      let streamedHeaderShown = false;
      let streamedReplyBuffer = '';
      let streamedDisplay = '';
      let inToolSection = false;
      const renderDisplay = () => {
        const header = streamedHeaderShown ? `💬 ${agent.name} is replying...\n\n` : '';
        const replyBlock = streamedReplyBuffer ? `${agent.name}:\n${streamedReplyBuffer}` : '';
        const toolSpacer = streamedDisplay && replyBlock ? `\n\n` : '';
        const text = `${header}${replyBlock}${toolSpacer}${streamedDisplay}`.trimEnd();
        onUpdate?.({
          content: [{ type: 'text', text }],
          details: {
            agent_id: agent.id,
            agent_name: agent.name,
            turn_id: turnId,
            stream: true,
          },
        });
      };
      const appendToolLine = (line: string) => {
        if (!inToolSection) {
          inToolSection = true;
          streamedDisplay += `🔧 Tool activity\n`;
        }
        streamedDisplay += line.endsWith('\n') ? line : `${line}\n`;
        renderDisplay();
      };
      const prettyOnUpdate = (update: any) => {
        switch (update?.type) {
          case 'chat_start': {
            if (!streamedHeaderShown) {
              streamedHeaderShown = true;
              renderDisplay();
            }
            break;
          }
          case 'chat_delta': {
            if (typeof update.delta === 'string') {
              streamedReplyBuffer += update.delta;
              renderDisplay();
            }
            break;
          }
          case 'chat_end': {
            renderDisplay();
            break;
          }
          case 'tool_started': {
            appendToolLine(`• ${update.agentName} used ${update.toolName}`);
            break;
          }
          case 'tool_stdout': {
            if (typeof update.data === 'string' && update.data) {
              for (const line of update.data.split(/\r?\n/).filter(Boolean)) {
                appendToolLine(`  ${line}`);
              }
            }
            break;
          }
          case 'tool_stderr': {
            if (typeof update.data === 'string' && update.data) {
              for (const line of update.data.split(/\r?\n/).filter(Boolean)) {
                appendToolLine(`  [stderr] ${line}`);
              }
            }
            break;
          }
        }
      };

      // Use gRPC streaming helper
      const streamingResult = await withGrpcWorkerStreaming({
        agentId: agent.id,
        agentName: agent.name,
        operationId: turnId,
        operationType: 'chat',
        onUpdate: prettyOnUpdate,
        signal,
      }, async () => {
        const sent = grpcServer.sendChat(masterConfig.id, agent.id, message, turnId, {
          mode,
          context: conversationContext,
        });

        if (!sent) {
          throw new Error(`Failed to send chat to ${agent.name} over gRPC`);
        }

        return {
          success: true,
          turnId,
          response: {
            reply: '',
          } as ChatResponse,
          persona: {
            name: agent.name,
            role: 'Agent',
          },
        };
      });
      
      const { finalResult, events } = streamingResult;
      
      // Format response for display from streamed events first
      const deltas = events.filter(e => e.type === 'agent_message_delta').map((e: any) => e.delta || '');
      const endEvent = [...events].reverse().find((e: any) => e.type === 'agent_message_end') as any;
      const startEvent = events.find((e: any) => e.type === 'agent_message_start') as any;
      const reply = endEvent?.finalMessage || deltas.join('') || streamedReplyBuffer || finalResult.response?.reply || finalResult.reply || 'No reply received';
      const personaName = startEvent?.persona?.name || finalResult.persona?.name || agent.name;
      const personaRole = startEvent?.persona?.role || finalResult.persona?.role || 'Agent';
      
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