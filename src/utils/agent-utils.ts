/**
 * Agent utility functions for lifecycle management
 */

import { AgentRegistryManager } from '../core/agent-registry.js';
import { AgentIdentity } from '../types/agent.js';
import { log } from './logger.js';

/**
 * Check if an agent name already exists in registry
 */
export function isDuplicateName(name: string, excludeId?: string): boolean {
  const registry = new AgentRegistryManager();
  const agents = registry.getAgents();
  
  return agents.some(agent => 
    agent.name === name && 
    (!excludeId || agent.id !== excludeId)
  );
}

/**
 * Find an available port starting from basePort
 */
export async function findAvailablePort(basePort: number, maxAttempts = 10): Promise<number> {
  const net = await import('net');
  
  for (let i = 0; i < maxAttempts; i++) {
    const port = basePort + i;
    
    const isAvailable = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      
      server.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          resolve(false); // Other error, treat as unavailable
        }
      });
      
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      
      server.listen(port, '127.0.0.1');
    });
    
    if (isAvailable) {
      return port;
    }
  }
  
  throw new Error(`No available ports found between ${basePort} and ${basePort + maxAttempts - 1}`);
}

/**
 * Get port range for agent type
 */
export function getPortRange(type: 'master' | 'worker'): { start: number, end: number } {
  // Dedicated high internal range for Clawx agent networking
  // master: 43100-43119, workers: 43120-43199
  if (type === 'master') {
    return { start: 43100, end: 43119 };
  } else {
    return { start: 43120, end: 43199 };
  }
}

/**
 * Find available port in appropriate range
 */
export async function findAvailablePortInRange(type: 'master' | 'worker'): Promise<number> {
  const range = getPortRange(type);
  return await findAvailablePort(range.start, range.end - range.start + 1);
}

/**
 * Clean up stale agents from registry
 * - Agents marked offline for more than cleanupThresholdMs
 * - Agents with no recent heartbeat
 */
export function cleanupStaleAgents(cleanupThresholdMs = 5 * 60 * 1000): number {
  const registry = new AgentRegistryManager();
  const agents = registry.getAgents();
  const now = Date.now();
  let cleaned = 0;
  
  for (const agent of agents) {
    const lastHeartbeat = agent.lastHeartbeat || agent.created;
    const shouldCleanup = 
      // Offline for too long
      (agent.status === 'offline' && now - lastHeartbeat > cleanupThresholdMs) ||
      // No heartbeat for too long (except self agents)
      (agent.type !== 'self' && now - lastHeartbeat > cleanupThresholdMs);
    
    if (shouldCleanup) {
      registry.removeAgent(agent.id);
      cleaned++;
      log.debug(`Cleaned up stale agent: ${agent.name} (${agent.id})`);
    }
  }
  
  if (cleaned > 0) {
    registry.save();
  }
  
  return cleaned;
}

/**
 * Check if an agent endpoint is reachable
 */
export async function checkAgentHealth(endpoint: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(`${endpoint}/health`, {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Update agent heartbeat
 */
export function updateAgentHeartbeat(agentId: string): boolean {
  const registry = new AgentRegistryManager();
  const agent = registry.getAgent(agentId);
  
  if (!agent) {
    return false;
  }
  
  agent.lastHeartbeat = Date.now();
  registry.upsertAgent(agent);
  registry.save();
  
  return true;
}

/**
 * Get unique agent name
 */
export function getUniqueAgentName(baseName: string): string {
  const registry = new AgentRegistryManager();
  const agents = registry.getAgents();
  const existingNames = new Set(agents.map(a => a.name));
  
  if (!existingNames.has(baseName)) {
    return baseName;
  }
  
  let counter = 1;
  while (existingNames.has(`${baseName}-${counter}`)) {
    counter++;
  }
  
  return `${baseName}-${counter}`;
}