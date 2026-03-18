/**
 * Persona utilities for loading and managing agent personas
 * 
 * Core doctrine: Persona content lives in user space, not in core.
 * Core only stores, loads, applies, and routes.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Persona, Memory, ConversationTurn } from '../types/persona.js';
import { log } from './logger.js';

/**
 * Get persona file path for an agent
 */
export function getPersonaFilePath(workspace: string): string {
  return join(workspace, 'persona.json');
}

/**
 * Get memory file path for an agent
 */
export function getMemoryFilePath(workspace: string): string {
  return join(workspace, 'memory.json');
}

/**
 * Get conversation log file path for an agent
 */
export function getConversationLogFilePath(workspace: string): string {
  return join(workspace, 'conversation-log.jsonl');
}

/**
 * Load persona from file if it exists
 */
export function loadPersona(workspace: string): Persona | null {
  try {
    const personaPath = getPersonaFilePath(workspace);
    if (!existsSync(personaPath)) {
      return null;
    }
    
    const content = readFileSync(personaPath, 'utf8');
    const persona = JSON.parse(content) as Persona;
    
    // Validate required fields
    if (!persona.id || !persona.name || !persona.role) {
      log.warn(`Persona file at ${personaPath} is missing required fields`);
      return null;
    }
    
    log.debug(`Loaded persona for workspace ${workspace}: ${persona.name} (${persona.role})`);
    return persona;
  } catch (error) {
    log.error(`Failed to load persona from ${workspace}:`, error);
    return null;
  }
}

/**
 * Save persona to file
 */
export function savePersona(workspace: string, persona: Persona): boolean {
  try {
    const personaPath = getPersonaFilePath(workspace);
    
    // Ensure workspace directory exists
    const dir = workspace;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    // Update timestamp
    persona.updatedAt = Date.now();
    
    writeFileSync(personaPath, JSON.stringify(persona, null, 2), 'utf8');
    log.debug(`Saved persona to ${personaPath}: ${persona.name} (${persona.role})`);
    return true;
  } catch (error) {
    log.error(`Failed to save persona to ${workspace}:`, error);
    return false;
  }
}

/**
 * Load memory from file if it exists
 */
export function loadMemory(workspace: string): Memory | null {
  try {
    const memoryPath = getMemoryFilePath(workspace);
    if (!existsSync(memoryPath)) {
      return null;
    }
    
    const content = readFileSync(memoryPath, 'utf8');
    const memory = JSON.parse(content) as Memory;
    
    log.debug(`Loaded memory for workspace ${workspace}`);
    return memory;
  } catch (error) {
    log.error(`Failed to load memory from ${workspace}:`, error);
    return null;
  }
}

/**
 * Save memory to file
 */
export function saveMemory(workspace: string, memory: Memory): boolean {
  try {
    const memoryPath = getMemoryFilePath(workspace);
    
    // Ensure workspace directory exists
    const dir = workspace;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    // Update timestamp
    memory.updatedAt = Date.now();
    
    writeFileSync(memoryPath, JSON.stringify(memory, null, 2), 'utf8');
    log.debug(`Saved memory to ${memoryPath}`);
    return true;
  } catch (error) {
    log.error(`Failed to save memory to ${workspace}:`, error);
    return false;
  }
}

/**
 * Append conversation turn to log
 */
export function logConversationTurn(workspace: string, turn: ConversationTurn): boolean {
  try {
    const logPath = getConversationLogFilePath(workspace);
    
    // Ensure workspace directory exists
    const dir = workspace;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    const line = JSON.stringify(turn);
    writeFileSync(logPath, line + '\n', { flag: 'a' });
    log.debug(`Logged conversation turn ${turn.id} to ${logPath}`);
    return true;
  } catch (error) {
    log.error(`Failed to log conversation turn to ${workspace}:`, error);
    return false;
  }
}

/**
 * Get recent conversation turns
 */
export function getRecentConversationTurns(workspace: string, limit: number = 10): ConversationTurn[] {
  try {
    const logPath = getConversationLogFilePath(workspace);
    if (!existsSync(logPath)) {
      return [];
    }
    
    const content = readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    // Parse last N lines
    const turns: ConversationTurn[] = [];
    for (let i = Math.max(0, lines.length - limit); i < lines.length; i++) {
      try {
        const turn = JSON.parse(lines[i]) as ConversationTurn;
        turns.push(turn);
      } catch (error) {
        log.warn(`Failed to parse conversation turn line ${i}:`, error);
      }
    }
    
    return turns.reverse(); // Most recent first
  } catch (error) {
    log.error(`Failed to read conversation turns from ${workspace}:`, error);
    return [];
  }
}

/**
 * Create default persona for an agent
 */
export function createDefaultPersona(agentId: string, agentName: string): Persona {
  return {
    id: agentId,
    name: agentName,
    role: 'Clawx Agent',
    tone: 'professional, helpful, concise',
    decision_style: 'analytical, evidence-based',
    strengths: ['task execution', 'file operations', 'git commands', 'search'],
    biases: ['prefers clear instructions', 'avoids speculation'],
    goals: ['execute tasks efficiently', 'provide accurate results'],
    boundaries: ['only executes allowed tools', 'respects workspace limits'],
    relationship_to_master: 'worker agent executing tasks and participating in conversations',
    notes: 'Default persona - can be customized by the master',
    version: '1.0.0',
    updatedAt: Date.now(),
  };
}

/**
 * Create default memory for an agent
 */
export function createDefaultMemory(): Memory {
  return {
    summary: 'New agent with default configuration',
    key_facts: [],
    recent_context: [],
    updatedAt: Date.now(),
  };
}

/**
 * Build persona context for agent prompts
 */
export function buildPersonaContext(persona: Persona, memory: Memory | null): string {
  const contextParts: string[] = [];
  
  // Persona identity
  contextParts.push(`# Agent Persona: ${persona.name}`);
  contextParts.push(`Role: ${persona.role}`);
  contextParts.push(`Tone: ${persona.tone}`);
  contextParts.push(`Decision Style: ${persona.decision_style}`);
  
  // Strengths and biases
  if (persona.strengths.length > 0) {
    contextParts.push(`Strengths: ${persona.strengths.join(', ')}`);
  }
  
  if (persona.biases.length > 0) {
    contextParts.push(`Biases: ${persona.biases.join(', ')}`);
  }
  
  // Goals and boundaries
  if (persona.goals.length > 0) {
    contextParts.push(`Goals: ${persona.goals.join(', ')}`);
  }
  
  if (persona.boundaries.length > 0) {
    contextParts.push(`Boundaries: ${persona.boundaries.join(', ')}`);
  }
  
  // Relationship
  contextParts.push(`Relationship to Master: ${persona.relationship_to_master}`);
  
  // Memory if available
  if (memory) {
    contextParts.push(`\n# Memory Summary: ${memory.summary}`);
    
    if (memory.key_facts.length > 0) {
      contextParts.push(`Key Facts: ${memory.key_facts.join(', ')}`);
    }
    
    if (memory.recent_context.length > 0) {
      contextParts.push(`Recent Context: ${memory.recent_context.slice(-3).join('; ')}`);
    }
  }
  
  // Notes
  if (persona.notes) {
    contextParts.push(`\n# Notes: ${persona.notes}`);
  }
  
  return contextParts.join('\n');
}