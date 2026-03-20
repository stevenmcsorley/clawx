/**
 * Shared stream event types for the active gRPC runtime.
 */

export type StreamEvent = 
  | { type: 'agent_message_start', turnId: string, persona?: { name: string, role: string }, parentOperationId?: string, parentOperationType?: 'chat' }
  | { type: 'agent_message_delta', turnId: string, delta: string, parentOperationId?: string, parentOperationType?: 'chat' }
  | { type: 'agent_message_end', turnId: string, finalMessage: string, parentOperationId?: string, parentOperationType?: 'chat' }
  | { type: 'task_started', taskId: string, tool: string, params: any, parentOperationId?: string, parentOperationType?: 'task' }
  | { type: 'task_progress', taskId: string, progress: number, message?: string, parentOperationId?: string, parentOperationType?: 'task' }
  | { type: 'tool_started', taskId: string, toolName: string, params: any, parentOperationId?: string, parentOperationType?: 'task' | 'chat' }
  | { type: 'tool_stdout', taskId: string, data: string, parentOperationId?: string, parentOperationType?: 'task' | 'chat' }
  | { type: 'tool_stderr', taskId: string, data: string, parentOperationId?: string, parentOperationType?: 'task' | 'chat' }
  | { type: 'tool_finished', taskId: string, result: any, parentOperationId?: string, parentOperationType?: 'task' | 'chat' }
  | { type: 'task_completed', taskId: string, result: any, parentOperationId?: string, parentOperationType?: 'task' }
  | { type: 'task_failed', taskId: string, error: string, parentOperationId?: string, parentOperationType?: 'task' }
  | { type: 'task_cancelled', taskId: string, parentOperationId?: string, parentOperationType?: 'task' }
  | { type: 'heartbeat', agentId: string, timestamp: number };
