/**
 * Agent Registry Management
 * 
 * Simple file-based registry for agent identities and tasks.
 * Designed to be robust against corruption and failures.
 */

import { join } from 'path';
import { homedir } from 'os';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { AgentRegistry, AgentIdentity, AgentTask } from '../types/agent.js';
import { log } from '../utils/logger.js';

const REGISTRY_DIR = join(homedir(), '.clawx', 'agents');
const REGISTRY_FILE = join(REGISTRY_DIR, 'registry.json');
const DEFAULT_REGISTRY: AgentRegistry = {
  version: '1.0.0',
  agents: [],
  tasks: [],
  updated: Date.now(),
};

export class AgentRegistryManager {
  private registry: AgentRegistry;
  private dirty = false;

  constructor() {
    this.registry = this.loadRegistry();
  }

  /** Load registry from disk, creating default if missing or invalid */
  private loadRegistry(): AgentRegistry {
    try {
      if (!existsSync(REGISTRY_FILE)) {
        this.ensureRegistryDir();
        return { ...DEFAULT_REGISTRY };
      }

      const content = readFileSync(REGISTRY_FILE, 'utf8');
      const parsed = JSON.parse(content);
      
      // Validate basic structure
      if (!parsed.version || !Array.isArray(parsed.agents) || !Array.isArray(parsed.tasks)) {
        log.warn('Agent registry invalid, creating fresh registry');
        return { ...DEFAULT_REGISTRY };
      }

      return {
        version: parsed.version,
        agents: parsed.agents || [],
        tasks: parsed.tasks || [],
        updated: parsed.updated || Date.now(),
      };
    } catch (error) {
      log.error('Failed to load agent registry:', error);
      return { ...DEFAULT_REGISTRY };
    }
  }

  /** Save registry to disk if dirty */
  save(): void {
    if (!this.dirty) return;

    try {
      this.ensureRegistryDir();
      this.registry.updated = Date.now();
      writeFileSync(REGISTRY_FILE, JSON.stringify(this.registry, null, 2), 'utf8');
      this.dirty = false;
      log.debug('Agent registry saved');
    } catch (error) {
      log.error('Failed to save agent registry:', error);
    }
  }

  /** Ensure registry directory exists */
  private ensureRegistryDir(): void {
    if (!existsSync(REGISTRY_DIR)) {
      mkdirSync(REGISTRY_DIR, { recursive: true });
    }
  }

  /** Get all agents */
  getAgents(): AgentIdentity[] {
    return [...this.registry.agents];
  }

  /** Get agent by ID */
  getAgent(id: string): AgentIdentity | undefined {
    return this.registry.agents.find(agent => agent.id === id);
  }

  /** Get agent by name */
  getAgentByName(name: string): AgentIdentity | undefined {
    return this.registry.agents.find(agent => agent.name === name);
  }

  /** Add or update agent */
  upsertAgent(agent: AgentIdentity): void {
    const index = this.registry.agents.findIndex(a => a.id === agent.id);
    
    if (index >= 0) {
      this.registry.agents[index] = agent;
    } else {
      this.registry.agents.push(agent);
    }
    
    this.dirty = true;
  }

  /** Remove agent by ID */
  removeAgent(id: string): boolean {
    const initialLength = this.registry.agents.length;
    this.registry.agents = this.registry.agents.filter(agent => agent.id !== id);
    
    if (this.registry.agents.length !== initialLength) {
      this.dirty = true;
      return true;
    }
    
    return false;
  }

  /** Update agent status */
  updateAgentStatus(id: string, status: AgentIdentity['status']): boolean {
    const agent = this.getAgent(id);
    if (!agent) return false;
    
    agent.status = status;
    agent.lastHeartbeat = Date.now();
    this.dirty = true;
    return true;
  }

  /** Get all tasks */
  getTasks(): AgentTask[] {
    return [...this.registry.tasks];
  }

  /** Get task by ID */
  getTask(id: string): AgentTask | undefined {
    return this.registry.tasks.find(task => task.id === id);
  }

  /** Get tasks for agent */
  getAgentTasks(agentId: string): AgentTask[] {
    return this.registry.tasks.filter(task => task.agentId === agentId);
  }

  /** Add or replace task by ID */
  addTask(task: AgentTask): void {
    const index = this.registry.tasks.findIndex(t => t.id === task.id);
    if (index >= 0) {
      this.registry.tasks[index] = task;
    } else {
      this.registry.tasks.push(task);
    }
    this.dirty = true;
  }

  /** Update task */
  updateTask(id: string, updates: Partial<AgentTask>): boolean {
    const task = this.getTask(id);
    if (!task) return false;
    
    Object.assign(task, updates);
    this.dirty = true;
    return true;
  }

  /** Remove task */
  removeTask(id: string): boolean {
    const initialLength = this.registry.tasks.length;
    this.registry.tasks = this.registry.tasks.filter(task => task.id !== id);
    
    if (this.registry.tasks.length !== initialLength) {
      this.dirty = true;
      return true;
    }
    
    return false;
  }

  /** Clean up old tasks, including stale pending/running tasks whose agents are gone/offline */
  cleanupOldTasks(maxAge: number = 24 * 60 * 60 * 1000, staleRunningAge: number = 30 * 60 * 1000): number {
    const cutoff = Date.now() - maxAge;
    const runningCutoff = Date.now() - staleRunningAge;
    const initialLength = this.registry.tasks.length;
    
    this.registry.tasks = this.registry.tasks.filter(task => {
      if (task.status === 'pending' || task.status === 'running') {
        const age = task.started || task.created;
        const agent = this.getAgent(task.agentId);
        const agentMissing = !agent;
        const agentOffline = agent?.status === 'offline';
        const staleRunning = age < runningCutoff;

        if ((agentMissing || agentOffline) && staleRunning) {
          return false;
        }
        return true;
      }
      
      // Remove old completed/failed/cancelled tasks
      return !!(task.completed && task.completed > cutoff);
    });
    
    const removed = initialLength - this.registry.tasks.length;
    if (removed > 0) {
      this.dirty = true;
    }
    
    return removed;
  }

  /** Mark offline agents that haven't heartbeated recently */
  markOfflineAgents(timeout: number = 30 * 1000): number {
    const cutoff = Date.now() - timeout;
    let marked = 0;
    
    for (const agent of this.registry.agents) {
      if (agent.status !== 'offline' && agent.lastHeartbeat && agent.lastHeartbeat < cutoff) {
        agent.status = 'offline';
        marked++;
        this.dirty = true;
      }
    }
    
    return marked;
  }

  /** Get registry path for debugging */
  getRegistryPath(): string {
    return REGISTRY_FILE;
  }

  /** Get agent workspace directory */
  getAgentWorkspace(agentId: string): string {
    return join(REGISTRY_DIR, agentId);
  }

  /** Ensure agent workspace exists */
  ensureAgentWorkspace(agentId: string): string {
    const workspace = this.getAgentWorkspace(agentId);
    if (!existsSync(workspace)) {
      mkdirSync(workspace, { recursive: true });
    }
    return workspace;
  }
}