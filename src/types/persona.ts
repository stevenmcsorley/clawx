/**
 * Persona types for agent personality and role configuration
 * 
 * Core doctrine: Persona content lives in user space, not in core.
 * Core only stores, loads, applies, and routes.
 * The model does the reasoning and persona writing.
 */

export interface Persona {
  /** Unique identifier for this persona */
  id: string;
  
  /** Display name */
  name: string;
  
  /** Role description (e.g., "Senior Developer", "Security Analyst") */
  role: string;
  
  /** Communication tone and style */
  tone: string;
  
  /** Decision-making style */
  decision_style: string;
  
  /** Key strengths and capabilities */
  strengths: string[];
  
  /** Known biases or preferences */
  biases: string[];
  
  /** Current goals or objectives */
  goals: string[];
  
  /** Boundaries or constraints */
  boundaries: string[];
  
  /** Relationship to master/other agents */
  relationship_to_master: string;
  
  /** Additional notes or instructions */
  notes: string;
  
  /** Persona version for updates */
  version: string;
  
  /** Last update timestamp */
  updatedAt: number;
}

export interface Memory {
  /** Summary of agent's memory state */
  summary: string;
  
  /** Key facts or knowledge */
  key_facts: string[];
  
  /** Recent conversation context */
  recent_context: string[];
  
  /** Last update timestamp */
  updatedAt: number;
}

export interface ConversationTurn {
  /** Turn ID */
  id: string;
  
  /** Speaker agent ID */
  speaker: string;
  
  /** Target agent ID */
  target: string;
  
  /** Message content */
  message: string;
  
  /** Optional context for this turn */
  context?: Record<string, any>;
  
  /** Conversation mode (e.g., 'discussion', 'task', 'brainstorm') */
  mode: string;
  
  /** Timestamp */
  timestamp: number;
  
  /** Optional structured notes from the agent */
  notes?: Record<string, any>;
}

export interface ChatRequest {
  /** Speaker agent ID */
  speaker: string;
  
  /** Target agent ID */
  target: string;
  
  /** Message content */
  message: string;
  
  /** Optional context */
  context?: Record<string, any>;
  
  /** Conversation mode */
  mode: string;
}

export interface ChatResponse {
  /** Reply text */
  reply: string;
  
  /** Optional structured notes */
  notes?: Record<string, any>;
  
  /** Updated memory summary if relevant */
  memory_update?: string;
  
  /** Suggested next actions */
  next_actions?: string[];
}