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
    const sanitizedContext = {
      cwd: context?.cwd,
      workerWorkspace: context?.workerWorkspace,
      masterWorkspace: context?.masterWorkspace,
    };
    
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
        payload: { tool, params: taskParams, context: { ...sanitizedContext, __transport: 'grpc' } },
        status: 'pending',
        created: Date.now(),
      };
      
      registry.addTask(task);
      registry.save();
      
      const masterServer = agentMaster.getServer();
      const masterConfig = agentMaster.getConfig();
      const grpcServer = masterServer?.grpcServer as any;
      if (!masterServer?.grpcPort || !masterConfig || !grpcServer?.sendTask) {
        throw new Error('Current session does not have an active gRPC master server instance');
      }

      let streamedDisplay = '';
      const pushPartial = () => {
        onUpdate?.({
          content: [{ type: 'text', text: streamedDisplay }],
          details: {
            task_id: taskId,
            agent_id: agent.id,
            agent_name: agent.name,
            tool,
            stream: true,
          },
        });
      };
      const prettyOnUpdate = (update: any) => {
        switch (update?.type) {
          case 'task_started':
            streamedDisplay += `\n${update.agentName} starting ${update.tool}\n`;
            pushPartial();
            break;
          case 'task_progress':
            streamedDisplay += `[${update.progress}%] ${update.message || ''}\n`;
            pushPartial();
            break;
          case 'tool_started':
            streamedDisplay += `\n[tool] ${update.toolName}\n`;
            pushPartial();
            break;
          case 'tool_stdout':
            streamedDisplay += update.data.endsWith('\n') ? update.data : `${update.data}\n`;
            pushPartial();
            break;
          case 'tool_stderr':
            streamedDisplay += `[stderr] ${update.data.endsWith('\n') ? update.data : `${update.data}\n`}`;
            pushPartial();
            break;
          case 'task_completed':
            streamedDisplay += `\n[completed]\n`;
            pushPartial();
            break;
          case 'task_failed':
            streamedDisplay += `\n[failed] ${update.error || 'Unknown error'}\n`;
            pushPartial();
            break;
          case 'task_cancelled':
            streamedDisplay += `\n[cancelled]\n`;
            pushPartial();
            break;
        }
      };

      // Use gRPC streaming helper
      const abortHandler = () => {
        grpcServer.cancelTask(masterConfig.id, agent.id, taskId, 'Aborted by master');
      };
      if (signal) {
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      const streamingResult = await withGrpcWorkerStreaming({
        agentId: agent.id,
        agentName: agent.name,
        operationId: taskId,
        operationType: 'task',
        onUpdate: prettyOnUpdate,
        signal,
      }, async () => {
        let transport: 'grpc' | 'http' = 'grpc';
        const sent = grpcServer.sendTask(masterConfig.id, agent.id, taskId, tool, taskParams, sanitizedContext);
        if (!sent) {
          log.warn(`gRPC sendTask to ${agent.name} failed, falling back to HTTP /task compatibility path`);
          const response = await fetch(`${agent.endpoint}/task`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: signal || AbortSignal.timeout(15000),
            body: JSON.stringify({
              tool,
              params: taskParams,
              context: { ...sanitizedContext, __transport: 'http' },
              taskId,
            }),
          });

          if (!response.ok) {
            throw new Error(`Failed to send task to ${agent.name} over gRPC or HTTP`);
          }

          transport = 'http';
          task.payload.context = { ...(task.payload.context || {}), __transport: 'http' };
        }

        task.status = 'running';
        task.started = Date.now();
        registry.addTask(task);
        registry.save();

        return { status: 'accepted', transport, taskId };
      });
      
      const { finalResult, events } = streamingResult;
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
      
      // Check final task status from events
      let finalStatus = task.status;
      let finalTaskResult: any = null;
      const usedTransport = finalResult?.transport || 'grpc';
      
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
      
      if ((finalStatus === 'pending' || finalStatus === 'running') && usedTransport === 'http' && agent.endpoint) {
        const waitUntil = Date.now() + 30000;
        while (Date.now() < waitUntil && !signal?.aborted) {
          try {
            const statusResponse = await fetch(`${agent.endpoint}/task/${taskId}/status`, {
              signal: signal || AbortSignal.timeout(5000),
            });
            if (statusResponse.ok) {
              const statusJson: any = await statusResponse.json();
              finalStatus = statusJson.status || finalStatus;
              if (finalStatus === 'completed' || finalStatus === 'failed' || finalStatus === 'cancelled') {
                const resultResponse = await fetch(`${agent.endpoint}/task/${taskId}/result`, {
                  signal: signal || AbortSignal.timeout(5000),
                });
                if (resultResponse.ok) {
                  const resultJson: any = await resultResponse.json();
                  finalTaskResult = resultJson.result;
                }
                break;
              }
            }
          } catch {
            // keep polling until timeout
          }
          await new Promise(resolve => setTimeout(resolve, 500));
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