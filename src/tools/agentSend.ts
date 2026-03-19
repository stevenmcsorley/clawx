/**
 * Agent Send Tool with gRPC Streaming
 * 
 * Send a task to an agent with live streaming via gRPC
 */

import { ToolDefinition } from '../types/extension.js';
import { log } from '../utils/logger.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { agentMaster } from '../core/agent-master.js';
import { AgentTask } from '../types/agent.js';
import { v4 as uuidv4 } from 'uuid';
import { withGrpcWorkerStreaming } from '../utils/grpc-streaming-tool-helper.js';

export const agentSendTool: ToolDefinition = {
  name: 'agent_send',
  label: 'Send Task to Agent',
  description: 'Send a task to a registered agent',
  parameters: {
    type: 'object',
    properties: {
      agent_id: {
        type: 'string',
        description: 'Agent ID to send task to',
      },
      agent_name: {
        type: 'string',
        description: 'Agent name to send task to (if ID not provided)',
      },
      tool: {
        type: 'string',
        description: 'Tool name to execute',
      },
      params: {
        type: 'object',
        description: 'Tool parameters',
        default: {},
      },
    },
    required: ['tool'],
  },
  
  async execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any, context?: any) {
    const agentId = params.agent_id;
    const agentName = params.agent_name;
    const tool = params.tool;
    const taskParams = params.params || {};
    
    try {
      const registry = new AgentRegistryManager();
      
      // Find agent
      const agent = agentId 
        ? registry.getAgent(agentId)
        : registry.getAgentByName(agentName!);
      
      if (!agent) {
        const identifier = agentId || agentName;
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
      
      // Generate task ID
      const taskId = uuidv4();
      
      // Create task record
      const task: AgentTask = {
        id: taskId,
        agentId: agent.id,
        type: 'execute',
        payload: { tool, params: taskParams, context: { ...(context || {}), __transport: 'grpc' } },
        status: 'pending',
        created: Date.now(),
      };
      
      registry.addTask(task);
      registry.save();
      
      const masterServer = agentMaster.getServer();
      const masterConfig = agentMaster.getConfig();
      if (!masterServer?.grpcPort || !masterConfig) {
        throw new Error('Current session is not serving as a gRPC-capable master');
      }

      // Use gRPC streaming helper
      const streamingResult = await withGrpcWorkerStreaming({
        agentId: agent.id,
        agentName: agent.name,
        operationId: taskId,
        operationType: 'task',
        onUpdate: onUpdate,
        signal,
      }, async () => {
        const grpcServer = (masterServer as any);
        const sent = grpcServer.sendTask(masterConfig.id, agent.id, taskId, tool, taskParams, context);
        if (!sent) {
          throw new Error(`Failed to send task to ${agent.name} over gRPC`);
        }

        task.status = 'running';
        task.started = Date.now();
        registry.addTask(task);
        registry.save();

        return { status: 'accepted', transport: 'grpc', taskId };
      });
      
      const { finalResult, events } = streamingResult;
      
      // Check final task status from events
      let finalStatus = task.status;
      let finalTaskResult: any = null;
      
      // Look for completion events
      for (const event of events) {
        if (event.type === 'task_completed') {
          finalStatus = 'completed';
          finalTaskResult = (event as any).result;
          break;
        } else if (event.type === 'task_failed') {
          finalStatus = 'failed';
          finalTaskResult = { error: (event as any).error };
          break;
        } else if (event.type === 'task_cancelled') {
          finalStatus = 'cancelled';
          break;
        }
      }
      
      // Update task in registry with final status
      task.status = finalStatus as any;
      if (finalStatus === 'completed' || finalStatus === 'failed' || finalStatus === 'cancelled') {
        task.completed = Date.now();
        if (finalTaskResult) task.result = finalTaskResult;
      }
      registry.addTask(task);
      registry.save();
      
      // Format response
      let responseText = '';
      if (finalStatus === 'completed') {
        responseText = `✅ Task ${taskId} completed`;
        if (finalTaskResult) {
          responseText += `\nResult: ${JSON.stringify(finalTaskResult, null, 2)}`;
        }
      } else if (finalStatus === 'failed') {
        responseText = `❌ Task ${taskId} failed`;
        if (finalTaskResult?.error) {
          responseText += `\nError: ${finalTaskResult.error}`;
        }
      } else if (finalStatus === 'cancelled') {
        responseText = `⏹️ Task ${taskId} cancelled`;
      } else {
        responseText = `⏳ Task ${taskId} still ${finalStatus}`;
      }
      
      return {
        content: [{
          type: 'text',
          text: responseText,
        }],
        details: {
          task_id: taskId,
          agent_id: agent.id,
          agent_name: agent.name,
          tool,
          status: finalStatus,
          result: finalTaskResult,
          events_count: events.length,
        },
      };
      
    } catch (error) {
      log.error('agent_send failed:', error);
      
      return {
        content: [{
          type: 'text',
          text: `❌ Task failed: ${error instanceof Error ? error.message : String(error)}`,
        }],
        details: { 
          error: 'Task failed',
          error_details: error instanceof Error ? error.message : String(error),
        },
        isError: true,
      };
    }
  },
};