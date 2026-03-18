/**
 * Clawx Agent Mesh Types
 * 
 * Core types for multi-agent MVP.
 * Keep minimal and focused on v1 scope.
 */

export interface AgentIdentity {
  /** Unique agent identifier (UUID) */
  id: string;
  
  /** User-assigned name for display */
  name: string;
  
  /** Agent type */
  type: 'local' | 'remote' | 'self';
  
  /** Current status */
  status: 'idle' | 'working' | 'offline' | 'error' | 'starting';
  
  /** Tools this agent can execute */
  capabilities: string[];
  
  /** HTTP endpoint for communication (local agents: http://localhost:port) */
  endpoint?: string;
  
  /** Process ID (local agents only) */
  pid?: number;
  
  /** Isolated workspace path */
  workspace: string;
  
  /** Creation timestamp */
  created: number;
  
  /** Last heartbeat timestamp */
  lastHeartbeat?: number;
  
  /** Platform (win32, darwin, linux) */
  platform?: string;
  
  /** Platform-specific capabilities */
  platformCapabilities?: {
    /** Search tool availability */
    search?: {
      hasGrep: boolean;
      hasRipgrep: boolean;
      recommendedTool: 'grep' | 'ripgrep' | 'node';
    };
  };
}

export interface AgentTask {
  /** Unique task identifier */
  id: string;
  
  /** Target agent ID */
  agentId: string;
  
  /** Task type */
  type: 'execute' | 'query' | 'control';
  
  /** Task payload */
  payload: {
    /** Tool name to execute */
    tool: string;
    
    /** Tool parameters */
    params: any;
    
    /** Optional execution context */
    context?: any;
  };
  
  /** Task status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  
  /** Tool execution result (when completed) */
  result?: any;
  
  /** Error message (if failed) */
  error?: string;
  
  /** Creation timestamp */
  created: number;
  
  /** Start timestamp */
  started?: number;
  
  /** Completion timestamp */
  completed?: number;
}

export interface AgentMessage {
  /** Message type */
  type: 'task' | 'result' | 'heartbeat' | 'control';
  
  /** Source agent ID */
  from?: string;
  
  /** Target agent ID */
  to?: string;
  
  /** Message payload */
  payload: any;
  
  /** Message timestamp */
  timestamp: number;
}

export interface AgentConfig {
  /** Agent ID */
  id: string;
  
  /** Agent name */
  name: string;
  
  /** Master endpoint for registration */
  masterEndpoint: string;
  
  /** Port to listen on (0 = auto) */
  port: number;
  
  /** Allowed tools (empty = all tools) */
  allowedTools: string[];
  
  /** Workspace directory */
  workspace: string;
}

/** Registry of known agents */
export interface AgentRegistry {
  /** Registry version */
  version: string;
  
  /** Known agents */
  agents: AgentIdentity[];
  
  /** Pending/completed tasks */
  tasks: AgentTask[];
  
  /** Last update timestamp */
  updated: number;
}

/** Agent server endpoints */
export const AGENT_API = {
  HEALTH: '/health',
  TASK: '/task',
  RESULT: '/task/:id/result',
  STATUS: '/task/:id/status',
  CANCEL: '/task/:id/cancel',
  HEARTBEAT: '/heartbeat',
  REGISTER: '/register',
  UNREGISTER: '/unregister',
} as const;