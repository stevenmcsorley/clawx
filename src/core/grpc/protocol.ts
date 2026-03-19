/**
 * gRPC Protocol for Clawx Agent Communication
 * 
 * Replaces SSE/WebSocket with structured gRPC streaming
 */

export interface GrpcAgentFrame {
  // Frame metadata
  id: string;
  type: GrpcFrameType;
  timestamp: number;
  
  // Routing metadata
  fromAgentId: string;
  toAgentId: string; // 'broadcast' for broadcast, 'server' for server messages
  
  // Operation scoping
  parentOperationId?: string;
  parentOperationType?: 'chat' | 'task';
  
  // Payload
  payload?: any;
  
  // Error handling
  error?: string;
}

export type GrpcFrameType = 
  | 'register'
  | 'registered'
  | 'heartbeat'
  | 'agent_message_start'
  | 'agent_message_delta'
  | 'agent_message_end'
  | 'task_started'
  | 'task_progress'
  | 'tool_started'
  | 'tool_stdout'
  | 'tool_stderr'
  | 'tool_finished'
  | 'task_completed'
  | 'task_failed'
  | 'task_cancelled'
  | 'chat_message'
  | 'system'
  | 'error';

export interface RegisterPayload {
  agentId: string;
  agentName: string;
  persona?: any;
  capabilities: string[];
  endpoint: string;
}

export interface RegisteredPayload {
  agentId: string;
  status: 'registered' | 'rejected';
  message?: string;
  masterEndpoint?: string;
}

export interface AgentMessageStartPayload {
  turnId: string;
  persona?: {
    name: string;
    role: string;
  };
}

export interface AgentMessageDeltaPayload {
  turnId: string;
  delta: string;
}

export interface AgentMessageEndPayload {
  turnId: string;
  finalMessage: string;
}

export interface TaskStartedPayload {
  taskId: string;
  tool: string;
  params: any;
}

export interface TaskProgressPayload {
  taskId: string;
  progress: number;
  message?: string;
}

export interface ToolStartedPayload {
  taskId: string;
  toolName: string;
  params: any;
}

export interface ToolOutputPayload {
  taskId: string;
  data: string;
}

export interface ToolFinishedPayload {
  taskId: string;
  result: any;
}

export interface TaskCompletedPayload {
  taskId: string;
  result: any;
}

export interface TaskFailedPayload {
  taskId: string;
  error: string;
}

export interface TaskCancelledPayload {
  taskId: string;
  reason?: string;
}

export interface ChatMessagePayload {
  message: string;
  conversationId?: string;
  mode?: string;
  context?: any;
}

export interface SystemPayload {
  message: string;
  data?: any;
}

// Helper functions for creating frames
export const GrpcFrames = {
  createRegister(agentId: string, agentName: string, endpoint: string, persona?: any, capabilities: string[] = []): GrpcAgentFrame {
    return {
      id: `reg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'register',
      timestamp: Date.now(),
      fromAgentId: agentId,
      toAgentId: 'server',
      payload: {
        agentId,
        agentName,
        endpoint,
        persona,
        capabilities,
      } as RegisterPayload,
    };
  },
  
  createRegistered(agentId: string, status: 'registered' | 'rejected', message?: string, masterEndpoint?: string): GrpcAgentFrame {
    return {
      id: `regack_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'registered',
      timestamp: Date.now(),
      fromAgentId: 'server',
      toAgentId: agentId,
      payload: {
        agentId,
        status,
        message,
        masterEndpoint,
      } as RegisteredPayload,
    };
  },
  
  createHeartbeat(agentId: string): GrpcAgentFrame {
    return {
      id: `hb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'heartbeat',
      timestamp: Date.now(),
      fromAgentId: agentId,
      toAgentId: 'server',
    };
  },
  
  createAgentMessageStart(turnId: string, fromAgentId: string, toAgentId: string, persona?: { name: string; role: string }): GrpcAgentFrame {
    return {
      id: `msg_start_${turnId}`,
      type: 'agent_message_start',
      timestamp: Date.now(),
      fromAgentId,
      toAgentId,
      parentOperationId: turnId,
      parentOperationType: 'chat',
      payload: {
        turnId,
        persona,
      } as AgentMessageStartPayload,
    };
  },
  
  createAgentMessageDelta(turnId: string, fromAgentId: string, toAgentId: string, delta: string): GrpcAgentFrame {
    return {
      id: `msg_delta_${turnId}_${Date.now()}`,
      type: 'agent_message_delta',
      timestamp: Date.now(),
      fromAgentId,
      toAgentId,
      parentOperationId: turnId,
      parentOperationType: 'chat',
      payload: {
        turnId,
        delta,
      } as AgentMessageDeltaPayload,
    };
  },
  
  createAgentMessageEnd(turnId: string, fromAgentId: string, toAgentId: string, finalMessage: string): GrpcAgentFrame {
    return {
      id: `msg_end_${turnId}`,
      type: 'agent_message_end',
      timestamp: Date.now(),
      fromAgentId,
      toAgentId,
      parentOperationId: turnId,
      parentOperationType: 'chat',
      payload: {
        turnId,
        finalMessage,
      } as AgentMessageEndPayload,
    };
  },
  
  createTaskStarted(taskId: string, fromAgentId: string, toAgentId: string, tool: string, params: any): GrpcAgentFrame {
    return {
      id: `task_start_${taskId}`,
      type: 'task_started',
      timestamp: Date.now(),
      fromAgentId,
      toAgentId,
      parentOperationId: taskId,
      parentOperationType: 'task',
      payload: {
        taskId,
        tool,
        params,
      } as TaskStartedPayload,
    };
  },
  
  createTaskProgress(taskId: string, fromAgentId: string, toAgentId: string, progress: number, message?: string): GrpcAgentFrame {
    return {
      id: `task_prog_${taskId}_${Date.now()}`,
      type: 'task_progress',
      timestamp: Date.now(),
      fromAgentId,
      toAgentId,
      parentOperationId: taskId,
      parentOperationType: 'task',
      payload: {
        taskId,
        progress,
        message,
      } as TaskProgressPayload,
    };
  },
  
  createToolStarted(taskId: string, fromAgentId: string, toAgentId: string, toolName: string, params: any, parentOperationType: 'task' | 'chat' = 'task'): GrpcAgentFrame {
    return {
      id: `tool_start_${taskId}_${Date.now()}`,
      type: 'tool_started',
      timestamp: Date.now(),
      fromAgentId,
      toAgentId,
      parentOperationId: taskId,
      parentOperationType,
      payload: {
        taskId,
        toolName,
        params,
      } as ToolStartedPayload,
    };
  },
  
  createToolStdout(taskId: string, fromAgentId: string, toAgentId: string, data: string, parentOperationType: 'task' | 'chat' = 'task'): GrpcAgentFrame {
    return {
      id: `tool_stdout_${taskId}_${Date.now()}`,
      type: 'tool_stdout',
      timestamp: Date.now(),
      fromAgentId,
      toAgentId,
      parentOperationId: taskId,
      parentOperationType,
      payload: {
        taskId,
        data,
      } as ToolOutputPayload,
    };
  },
  
  createToolStderr(taskId: string, fromAgentId: string, toAgentId: string, data: string, parentOperationType: 'task' | 'chat' = 'task'): GrpcAgentFrame {
    return {
      id: `tool_stderr_${taskId}_${Date.now()}`,
      type: 'tool_stderr',
      timestamp: Date.now(),
      fromAgentId,
      toAgentId,
      parentOperationId: taskId,
      parentOperationType,
      payload: {
        taskId,
        data,
      } as ToolOutputPayload,
    };
  },
  
  createToolFinished(taskId: string, fromAgentId: string, toAgentId: string, result: any, parentOperationType: 'task' | 'chat' = 'task'): GrpcAgentFrame {
    return {
      id: `tool_finish_${taskId}`,
      type: 'tool_finished',
      timestamp: Date.now(),
      fromAgentId,
      toAgentId,
      parentOperationId: taskId,
      parentOperationType,
      payload: {
        taskId,
        result,
      } as ToolFinishedPayload,
    };
  },
  
  createTaskCompleted(taskId: string, fromAgentId: string, toAgentId: string, result: any): GrpcAgentFrame {
    return {
      id: `task_complete_${taskId}`,
      type: 'task_completed',
      timestamp: Date.now(),
      fromAgentId,
      toAgentId,
      parentOperationId: taskId,
      parentOperationType: 'task',
      payload: {
        taskId,
        result,
      } as TaskCompletedPayload,
    };
  },
  
  createTaskFailed(taskId: string, fromAgentId: string, toAgentId: string, error: string): GrpcAgentFrame {
    return {
      id: `task_fail_${taskId}`,
      type: 'task_failed',
      timestamp: Date.now(),
      fromAgentId,
      toAgentId,
      parentOperationId: taskId,
      parentOperationType: 'task',
      payload: {
        taskId,
        error,
      } as TaskFailedPayload,
    };
  },

  createTaskCancelled(taskId: string, fromAgentId: string, toAgentId: string, reason?: string): GrpcAgentFrame {
    return {
      id: `task_cancel_${taskId}`,
      type: 'task_cancelled',
      timestamp: Date.now(),
      fromAgentId,
      toAgentId,
      parentOperationId: taskId,
      parentOperationType: 'task',
      payload: {
        taskId,
        reason,
      } as TaskCancelledPayload,
    };
  },
  
  createChatMessage(fromAgentId: string, toAgentId: string, message: string, conversationId?: string, extraPayload?: Record<string, any>): GrpcAgentFrame {
    return {
      id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'chat_message',
      timestamp: Date.now(),
      fromAgentId,
      toAgentId,
      parentOperationId: conversationId,
      parentOperationType: 'chat',
      payload: {
        message,
        conversationId,
        ...(extraPayload || {}),
      } as ChatMessagePayload,
    };
  },
  
  createSystemMessage(toAgentId: string, message: string, data?: any): GrpcAgentFrame {
    return {
      id: `sys_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'system',
      timestamp: Date.now(),
      fromAgentId: 'server',
      toAgentId,
      payload: {
        message,
        data,
      } as SystemPayload,
    };
  },
  
  createErrorMessage(toAgentId: string, error: string, fromAgentId: string = 'server'): GrpcAgentFrame {
    return {
      id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'error',
      timestamp: Date.now(),
      fromAgentId,
      toAgentId,
      error,
    };
  },
};