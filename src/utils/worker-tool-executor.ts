/**
 * Worker Tool Executor
 * 
 * Executes tools for workers with proper streaming and state management.
 * Provides the same execution path for both chat-triggered and task-triggered actions.
 */

import { log } from './logger.js';
import { createSearchFilesTool } from '../tools/searchFiles.js';
import { createGitStatusTool } from '../tools/gitStatus.js';
import { createGitDiffTool } from '../tools/gitDiff.js';
import { createSshRunTool } from '../tools/sshRun.js';
import { createAgentChatDirectTool } from '../tools/agentChatDirect.js';
// WebSocket chat tool removed - replaced by gRPC chat
import {
  createCodingTools,
  createGrepTool,
  createFindTool,
  createLsTool,
} from '@mariozechner/pi-coding-agent';

export interface ToolExecutionResult {
  success: boolean;
  output: string;
  details?: any;
  error?: string;
}

export interface ToolExecutionStream {
  onEvent: (event: ToolExecutionEvent) => void;
  result: Promise<ToolExecutionResult>;
}

export type ToolExecutionEvent = 
  | { type: 'tool_started', toolName: string, params: any }
  | { type: 'tool_stdout', data: string }
  | { type: 'tool_stderr', data: string }
  | { type: 'tool_progress', progress: number, message?: string }
  | { type: 'tool_finished', result: ToolExecutionResult };

/**
 * Get available tools for a worker based on workspace and config
 */
export function getWorkerTools(workspace: string, allowedTools: string[] = []) {
  const tools: any[] = [];
  const cwd = workspace;
  
  // Always include basic tools if allowed or if no restrictions
  const canUseTool = (toolName: string) => {
    const canUse = allowedTools.length === 0 || allowedTools.includes(toolName);
    log.debug(`canUseTool(${toolName}): allowedTools=${JSON.stringify(allowedTools)}, result=${canUse}`);
    return canUse;
  };
  
  // pi-coding-agent's built-in coding tools: read, write, edit, bash
  // Include them if allowed or if no restrictions
  const codingTools = createCodingTools(cwd);
  for (const tool of codingTools) {
    if (canUseTool(tool.name)) {
      tools.push(tool);
    }
  }
  
  // Add grep, find, ls from pi-coding-agent
  if (canUseTool('grep')) {
    tools.push(createGrepTool(cwd));
  }
  
  if (canUseTool('find')) {
    tools.push(createFindTool(cwd));
  }
  
  if (canUseTool('ls')) {
    tools.push(createLsTool(cwd));
  }
  
  // Our custom tools
  if (canUseTool('search_files')) {
    tools.push(createSearchFilesTool(cwd));
  }
  
  if (canUseTool('git_status')) {
    tools.push(createGitStatusTool(cwd));
  }
  
  if (canUseTool('git_diff')) {
    tools.push(createGitDiffTool(cwd));
  }
  
  if (canUseTool('ssh_run')) {
    tools.push(createSshRunTool({})); // SSH targets would come from config
  }
  
  // Agent communication tools (for worker-to-worker chat)
  if (canUseTool('agent_chat_direct')) {
    log.debug('Adding agent_chat_direct tool');
    try {
      tools.push(createAgentChatDirectTool(cwd));
      log.debug('✅ agent_chat_direct tool added successfully');
    } catch (error) {
      log.error('❌ Failed to add agent_chat_direct tool:', error);
    }
  } else {
    log.debug('NOT adding agent_chat_direct tool - not allowed');
  }
  
  // Note: agent_grpc_chat tool requires gRPC server instance
  // It's added dynamically in agent-server.ts when gRPC server is available
  // Not added here as a static tool
  
  log.info(`Worker has ${tools.length} available tools: ${tools.map(t => t.name).join(', ')}`);
  return tools;
}

/**
 * Execute a tool with streaming events
 */
export function executeToolWithStream(
  toolName: string,
  params: any,
  workspace: string,
  allowedTools: string[] = [],
  context?: any,
  onEvent?: (event: any) => void,
  parentOperationId?: string,  // taskId or turnId for chat tool calls
  parentOperationType?: 'task' | 'chat'  // Type of parent operation
): ToolExecutionStream {
  const events: ToolExecutionEvent[] = [];
  let resolveResult: (result: ToolExecutionResult) => void;
  
  const resultPromise = new Promise<ToolExecutionResult>((resolve) => {
    resolveResult = resolve;
  });
  
  // Start execution in background
  setTimeout(async () => {
    try {
      // Check if tool is allowed
      if (allowedTools.length > 0 && !allowedTools.includes(toolName)) {
        const errorResult: ToolExecutionResult = {
          success: false,
          output: `Tool "${toolName}" is not allowed. Allowed tools: ${allowedTools.join(', ')}`,
          error: 'Tool not allowed',
        };
        events.push({ type: 'tool_started', toolName, params });
        events.push({ type: 'tool_finished', result: errorResult });
        resolveResult(errorResult);
        return;
      }
      
      events.push({ type: 'tool_started', toolName, params });
      if (onEvent) {
        onEvent({ 
          type: 'tool_started', 
          toolName, 
          params,
          ...(parentOperationId ? { taskId: parentOperationId } : {}),
          ...(parentOperationId && parentOperationType ? { 
            parentOperationId, 
            parentOperationType 
          } : {})
        });
      }
      
      // Get the appropriate tool
      const cwd = workspace;
      let toolDefinition;
      
      // First check pi-coding-agent tools
      const codingTools = createCodingTools(cwd);
      const codingTool = codingTools.find(t => t.name === toolName);
      if (codingTool) {
        toolDefinition = codingTool;
      } else {
        // Check other tools
        switch (toolName) {
          case 'grep':
            toolDefinition = createGrepTool(cwd);
            break;
          case 'find':
            toolDefinition = createFindTool(cwd);
            break;
          case 'ls':
            toolDefinition = createLsTool(cwd);
            break;
          case 'search_files':
            toolDefinition = createSearchFilesTool(cwd);
            break;
          case 'git_status':
            toolDefinition = createGitStatusTool(cwd);
            break;
          case 'git_diff':
            toolDefinition = createGitDiffTool(cwd);
            break;
          case 'ssh_run':
            toolDefinition = createSshRunTool({});
            break;
          default:
            throw new Error(`Tool not supported: ${toolName}`);
        }
      }
      
      // Execute tool
      const toolCallId = `worker-tool-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      
      // Simple execution without streaming for now (will enhance later)
      // Use type assertion to handle varying execute signatures
      const toolExecute = toolDefinition.execute as any;
      let result;
      
      // Special handling for bash tool to capture stdout/stderr
      if (toolName === 'bash') {
        try {
          // Try to use streaming bash wrapper for incremental output
          const { executeBashWithStreaming, canUseStreamingBash } = await import('./streaming-bash-wrapper.js');
          
          if (canUseStreamingBash() && params.command && onEvent) {
            // Use streaming bash for incremental output
            const bashResult = await executeBashWithStreaming({
              command: params.command,
              cwd: workspace,
              onStdout: (data) => {
                if (onEvent && data.trim()) {
                  onEvent({ 
                    type: 'tool_stdout', 
                    toolName, 
                    data,
                    ...(parentOperationId ? { taskId: parentOperationId } : {}),
                    ...(parentOperationId && parentOperationType ? { 
                      parentOperationId, 
                      parentOperationType 
                    } : {})
                  });
                }
              },
              onStderr: (data) => {
                if (onEvent && data.trim()) {
                  onEvent({ 
                    type: 'tool_stderr', 
                    toolName, 
                    data,
                    ...(parentOperationId ? { taskId: parentOperationId } : {}),
                    ...(parentOperationId && parentOperationType ? { 
                      parentOperationId, 
                      parentOperationType 
                    } : {})
                  });
                }
              },
            });
            
            // Format result similar to pi-coding-agent's bash tool
            result = {
              content: [{
                type: 'text',
                text: bashResult.stdout,
              }],
              details: {
                exitCode: bashResult.exitCode,
                stderr: bashResult.stderr,
                success: bashResult.success,
              },
            };
          } else {
            // Fall back to original bash tool
            if (toolExecute.length >= 5) {
              result = await toolExecute(toolCallId, params, undefined, undefined, context);
            } else {
              result = await toolExecute(toolCallId, params, context);
            }
            
            // Emit captured output after completion
            if (onEvent && result && typeof result === 'object') {
              if (result.content && Array.isArray(result.content)) {
                const textContent = result.content.find((c: any) => c.type === 'text');
                if (textContent && 'text' in textContent) {
                  onEvent({ 
                    type: 'tool_stdout', 
                    toolName, 
                    data: textContent.text,
                    ...(parentOperationId ? { taskId: parentOperationId } : {}),
                    ...(parentOperationId && parentOperationType ? { 
                      parentOperationId, 
                      parentOperationType 
                    } : {})
                  });
                }
              }
            }
          }
        } catch (error) {
          log.error('Streaming bash failed, falling back:', error);
          // Fall back to original
          if (toolExecute.length >= 5) {
            // Create a dummy AbortController for tools that expect an AbortSignal
            const abortController = new AbortController();
            result = await toolExecute(toolCallId, params, abortController.signal, onEvent, context);
          } else {
            // Tool has fewer than 5 parameters - call with appropriate arity
            if (toolExecute.length === 2) {
              // execute(params, ctx)
              result = await toolExecute(params, context);
            } else if (toolExecute.length === 3) {
              // execute(toolCallId, params, ctx)
              result = await toolExecute(toolCallId, params, context);
            } else {
              // execute(toolCallId, params) or other
              result = await toolExecute(toolCallId, params);
            }
          }
        }
      } else {
        // Regular execution for other tools
        if (toolExecute.length >= 5) {
          // Create a dummy AbortController for tools that expect an AbortSignal
          const abortController = new AbortController();
          result = await toolExecute(toolCallId, params, abortController.signal, onEvent, context);
        } else {
          // Tool has fewer than 5 parameters - call with appropriate arity
          if (toolExecute.length === 2) {
            // execute(params, ctx)
            result = await toolExecute(params, context);
          } else if (toolExecute.length === 3) {
            // execute(toolCallId, params, ctx)
            result = await toolExecute(toolCallId, params, context);
          } else {
            // execute(toolCallId, params) or other
            result = await toolExecute(toolCallId, params);
          }
        }
        
        // Try to capture output from other tools too
        if (onEvent && result) {
          if (typeof result === 'string') {
            onEvent({ 
              type: 'tool_stdout', 
              toolName, 
              data: result,
              ...(parentOperationId ? { taskId: parentOperationId } : {}),
              ...(parentOperationId && parentOperationType ? { 
                parentOperationId, 
                parentOperationType 
              } : {})
            });
          } else if (typeof result === 'object') {
            // Try to extract text content
            if (result.content && Array.isArray(result.content)) {
              const textContent = result.content.find((c: any) => c.type === 'text');
              if (textContent && 'text' in textContent) {
                onEvent({ 
                  type: 'tool_stdout', 
                  toolName, 
                  data: textContent.text,
                  ...(parentOperationId ? { taskId: parentOperationId } : {}),
                  ...(parentOperationId && parentOperationType ? { 
                    parentOperationId, 
                    parentOperationType 
                  } : {})
                });
              }
            } else if (result.output) {
              onEvent({ 
                type: 'tool_stdout', 
                toolName, 
                data: String(result.output),
                ...(parentOperationId ? { taskId: parentOperationId } : {}),
                ...(parentOperationId && parentOperationType ? { 
                  parentOperationId, 
                  parentOperationType 
                } : {})
              });
            } else if (result.text) {
              onEvent({ 
                type: 'tool_stdout', 
                toolName, 
                data: String(result.text),
                ...(parentOperationId ? { taskId: parentOperationId } : {}),
                ...(parentOperationId && parentOperationType ? { 
                  parentOperationId, 
                  parentOperationType 
                } : {})
              });
            }
          }
        }
      }
      
      // Handle result generically since we don't know the exact type
      const executionResult: ToolExecutionResult = {
        success: true, // Assume success unless we can detect otherwise
        output: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        details: result,
      };
      
      events.push({ type: 'tool_finished', result: executionResult });
      if (onEvent) {
        onEvent({ 
          type: 'tool_finished', 
          toolName, 
          result: executionResult,
          ...(parentOperationId ? { taskId: parentOperationId } : {}),
          ...(parentOperationId && parentOperationType ? { 
            parentOperationId, 
            parentOperationType 
          } : {})
        });
      }
      resolveResult(executionResult);
      
    } catch (error) {
      log.error(`Tool execution failed: ${toolName}`, error);
      
      const errorResult: ToolExecutionResult = {
        success: false,
        output: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      };
      
      events.push({ type: 'tool_finished', result: errorResult });
      if (onEvent) {
        onEvent({ 
          type: 'tool_finished', 
          toolName, 
          result: errorResult,
          ...(parentOperationId ? { taskId: parentOperationId } : {}),
          ...(parentOperationId && parentOperationType ? { 
            parentOperationId, 
            parentOperationType 
          } : {})
        });
      }
      resolveResult(errorResult);
    }
  }, 0);
  
  return {
    onEvent: (event: ToolExecutionEvent) => {
      events.push(event);
    },
    result: resultPromise,
  };
}

/**
 * Execute multiple tool calls from a model response
 */
export async function executeToolCalls(
  toolCalls: any[],
  workspace: string,
  allowedTools: string[] = [],
  context?: any,
  onEvent?: (event: any) => void,
  parentOperationId?: string,
  parentOperationType?: 'task' | 'chat'
): Promise<{ results: ToolExecutionResult[]; combinedOutput: string }> {
  const results: ToolExecutionResult[] = [];
  let combinedOutput = '';
  
  for (const toolCall of toolCalls) {
    const { name, arguments: args } = toolCall;
    
    log.info(`Executing tool call: ${name}(${JSON.stringify(args).slice(0, 100)}...)`);
    
    const stream = executeToolWithStream(name, args, workspace, allowedTools, context, onEvent, parentOperationId, parentOperationType);
    const result = await stream.result;
    
    results.push(result);
    
    if (result.success) {
      combinedOutput += `\n\n**Tool ${name} executed successfully:**\n${result.output}`;
    } else {
      combinedOutput += `\n\n**Tool ${name} failed:** ${result.error}`;
    }
  }
  
  return { results, combinedOutput };
}