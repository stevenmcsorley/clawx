/**
 * Agent Master Singleton
 * 
 * Single source of truth for whether this process is serving as master.
 * Shared across all tool executions in the same process.
 */

import type { AgentConfig } from '../types/agent.js';
import type { AgentServer } from './agent-server.js';

let _agentServer: AgentServer | null = null;
let _agentConfig: AgentConfig | null = null;

export const agentMaster = {
  /** Get current master server instance */
  getServer(): AgentServer | null {
    return _agentServer;
  },

  /** Get current master config */
  getConfig(): AgentConfig | null {
    return _agentConfig;
  },

  /** Check if currently serving as master */
  isServing(): boolean {
    return !!_agentServer;
  },

  /** Set master server instance */
  setServer(server: AgentServer, config: AgentConfig): void {
    _agentServer = server;
    _agentConfig = config;
  },

  /** Clear master server instance (on shutdown) */
  clear(): void {
    if (_agentServer) {
      _agentServer.close();
    }
    _agentServer = null;
    _agentConfig = null;
  },

  /** Get master endpoint if serving */
  getEndpoint(): string | null {
    if (_agentServer && _agentConfig) {
      return `http://localhost:${_agentServer.port}`;
    }
    return null;
  },
};