/**
 * Worker-side model caller for persona-driven conversations
 * 
 * Provides a clean interface for workers to generate chat responses
 * using the configured model/provider, with persona and memory context.
 */

import { streamSimple, type Context, type Message, type Model, type AssistantMessage } from "@mariozechner/pi-ai";
import { resolveModel } from "../core/provider.js";
import { loadConfig } from "../config/index.js";
import { log } from "./logger.js";
import type { Persona, Memory, ConversationTurn } from "../types/persona.js";

function detectOutputConstraints(message: string): { exactBulletCount?: number; exactNumberedCount?: number; jsonOnly?: boolean; observedFactsOnly?: boolean } {
  const text = message.toLowerCase();
  const constraints: { exactBulletCount?: number; exactNumberedCount?: number; jsonOnly?: boolean; observedFactsOnly?: boolean } = {};

  const bulletMatch = text.match(/exactly\s+(\d+)\s+bullet/);
  if (bulletMatch) constraints.exactBulletCount = parseInt(bulletMatch[1], 10);

  const numberedMatch = text.match(/exactly\s+(\d+)\s+numbered/);
  if (numberedMatch) constraints.exactNumberedCount = parseInt(numberedMatch[1], 10);

  if (text.includes('json only')) constraints.jsonOnly = true;
  if (text.includes('use only observed') || text.includes('using only those facts') || text.includes('use only the observed facts') || text.includes('verified facts only') || text.includes('do not introduce any new issues')) {
    constraints.observedFactsOnly = true;
  }

  return constraints;
}

function countBulletLines(reply: string): number {
  return reply.split(/\r?\n/).filter(line => /^\s*[-*•]\s+/.test(line)).length;
}

function countNumberedLines(reply: string): number {
  return reply.split(/\r?\n/).filter(line => /^\s*\d+[.)]\s+/.test(line)).length;
}

function isLikelyJsonOnly(reply: string): boolean {
  const trimmed = reply.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function hasConstraintViolations(message: string, reply: string): string[] {
  const constraints = detectOutputConstraints(message);
  const violations: string[] = [];

  if (constraints.exactBulletCount !== undefined) {
    const count = countBulletLines(reply);
    if (count !== constraints.exactBulletCount) {
      violations.push(`expected exactly ${constraints.exactBulletCount} bullet points, got ${count}`);
    }
  }

  if (constraints.exactNumberedCount !== undefined) {
    const count = countNumberedLines(reply);
    if (count !== constraints.exactNumberedCount) {
      violations.push(`expected exactly ${constraints.exactNumberedCount} numbered items, got ${count}`);
    }
  }

  if (constraints.jsonOnly && !isLikelyJsonOnly(reply)) {
    violations.push('expected JSON-only output');
  }

  return violations;
}

/**
 * Build conversation context from persona, memory, and incoming turn
 */
export function buildConversationContext(
  persona: Persona | null,
  memory: Memory | null,
  turn: ConversationTurn,
  workspace: string
): string {
  let context = `# Agent Conversation Context\n\n`;
  
  // Agent identity
  context += `## Agent Identity\n`;
  context += `Workspace: ${workspace}\n`;
  context += `Current time: ${new Date().toISOString()}\n\n`;
  
  // Persona context
  if (persona) {
    context += `## Persona: ${persona.name}\n`;
    context += `Role: ${persona.role}\n`;
    context += `Tone: ${persona.tone}\n`;
    context += `Decision Style: ${persona.decision_style}\n`;
    
    if (persona.strengths.length > 0) {
      context += `Strengths: ${persona.strengths.join(', ')}\n`;
    }
    
    if (persona.goals.length > 0) {
      context += `Goals: ${persona.goals.join(', ')}\n`;
    }
    
    if (persona.biases.length > 0) {
      context += `Biases to be aware of: ${persona.biases.join(', ')}\n`;
    }
    
    if (persona.boundaries.length > 0) {
      context += `Boundaries: ${persona.boundaries.join(', ')}\n`;
    }
    
    context += `Relationship to Master: ${persona.relationship_to_master}\n`;
    
    if (persona.notes) {
      context += `Notes: ${persona.notes}\n`;
    }
    
    context += `\n`;
  } else {
    context += `## Persona: Not configured (default agent behavior)\n\n`;
  }
  
  // Memory context
  if (memory) {
    context += `## Memory Summary\n`;
    context += `${memory.summary}\n\n`;
    
    if (memory.key_facts.length > 0) {
      context += `Key Facts:\n`;
      memory.key_facts.forEach(fact => {
        context += `- ${fact}\n`;
      });
      context += `\n`;
    }
    
    if (memory.recent_context.length > 0) {
      context += `Recent Context:\n`;
      memory.recent_context.slice(-3).forEach(contextItem => {
        context += `- ${contextItem}\n`;
      });
      context += `\n`;
    }
  }
  
  // Conversation context
  context += `## Current Conversation\n`;
  context += `Speaker: ${turn.speaker}\n`;
  context += `Mode: ${turn.mode || 'discussion'}\n`;
  if (turn.context && Object.keys(turn.context).length > 0) {
    context += `Additional context: ${JSON.stringify(turn.context, null, 2)}\n`;
  }
  context += `\n`;
  
  // Instructions
  context += `## Instructions\n`;
  context += `Respond as the agent persona described above.\n`;
  context += `Be authentic to the persona's tone, role, and decision style.\n`;
  context += `Ground every claim in one of these sources only: the current user message, the Additional context above, the Memory Summary/Recent Context above, or real tool output generated in this turn.\n`;
  context += `If the user asks you to use only observed, verified, or provided facts, do exactly that and say you do not have evidence for anything else.\n`;
  context += `Do not introduce unrelated topics, imaginary tests, imaginary incidents, invented root causes, or facts not present in the allowed sources above.\n`;
  context += `If you need to execute a real action, use the available tools.\n`;
  context += `Do not fabricate command outputs or pretend to execute actions without using tools.\n`;
  context += `If a requested action cannot be performed with available tools, explain why honestly.\n`;
  context += `When unsure, explicitly say what is unknown instead of filling gaps.\n`;
  context += `Keep responses concise but thoughtful.\n`;
  
  return context;
}

/**
 * Generate a chat response using the actual model
 */
export async function generateModelChatResponse(
  persona: Persona | null,
  memory: Memory | null,
  turn: ConversationTurn,
  workspace: string,
  availableTools: any[] = [],  // Add tools parameter for grounded execution
  onEvent?: (event: any) => void,  // Event callback for streaming
  validationAttempt = 0
): Promise<{ reply: string; thinking?: string; toolCalls?: any[] }> {
  try {
    // Load worker configuration
    // Workers inherit config from master's environment, but can have workspace-specific overrides
    // First try to load from workspace, then fall back to default
    let config;
    try {
      // Change to workspace directory to load local config
      const originalCwd = process.cwd();
      process.chdir(workspace);
      config = loadConfig();
      process.chdir(originalCwd);
    } catch (error) {
      // Fall back to default config
      config = loadConfig();
    }
    
    // Resolve model from config
    const model = resolveModel(config);
    
    // Build system prompt from persona and memory
    const systemPrompt = buildConversationContext(persona, memory, turn, workspace);
    
    // Build user message
    const userMessage = turn.message;
    
    // Create context for model call
    const context: Context = {
      systemPrompt,
      messages: [
        {
          role: 'user' as const,
          content: userMessage,
          timestamp: Date.now(),
        }
      ],
      tools: availableTools, // Provide real tools for grounded execution
    };
    
    log.info(`Generating chat response for persona: ${persona?.name || 'default'}`);
    log.debug(`System prompt length: ${systemPrompt.length} chars`);
    log.debug(`User message: ${userMessage.substring(0, 100)}...`);
    
    // Call the model
    const stream = streamSimple(model, context, {
      apiKey: config.apiKey,
      maxTokens: config.maxTokens,
      reasoning: config.thinkingLevel === 'off' ? undefined : config.thinkingLevel,
    });
    
    // Collect response
    let reply = '';
    let thinking = '';
    const toolCalls: any[] = [];
    
    // Emit start event
    if (onEvent) {
      onEvent({ type: 'agent_message_start', turnId: turn.id, persona: persona ? { name: persona.name, role: persona.role } : undefined });
    }
    
    for await (const event of stream) {
      if (event.type === 'text_delta') {
        reply += event.delta;
        // Emit delta event
        if (onEvent) {
          onEvent({ type: 'agent_message_delta', turnId: turn.id, delta: event.delta });
        }
      } else if (event.type === 'thinking_delta') {
        thinking += event.delta;
      } else if (event.type === 'toolcall_start' || event.type === 'toolcall_end') {
        // Track tool calls for grounded execution
        if (event.type === 'toolcall_end' && event.toolCall) {
          toolCalls.push(event.toolCall);
        }
      } else if (event.type === 'done') {
        // Response complete
        const message = event.message as AssistantMessage;
        if (message.stopReason === 'error') {
          throw new Error(`Model error: ${message.errorMessage || 'Unknown error'}`);
        }
        break;
      } else if (event.type === 'error') {
        throw new Error(`Stream error: ${event.error?.errorMessage || 'Unknown stream error'}`);
      }
    }
    
    const violations = hasConstraintViolations(turn.message, reply);
    if (violations.length > 0 && validationAttempt === 0) {
      log.warn(`Reply violated explicit output constraints for ${turn.id}: ${violations.join('; ')}`);
      const repairedTurn: ConversationTurn = {
        ...turn,
        message: `${turn.message}\n\nIMPORTANT REPAIR: Your previous reply violated these explicit output constraints: ${violations.join('; ')}. Rewrite the answer so it follows the original constraints exactly. Do not add commentary about the repair.`,
      };
      return await generateModelChatResponse(persona, memory, repairedTurn, workspace, availableTools, onEvent, 1);
    }

    // Emit end event
    if (onEvent) {
      onEvent({ type: 'agent_message_end', turnId: turn.id, finalMessage: reply });
    }
    
    log.info(`Generated response length: ${reply.length} chars`);
    if (thinking) {
      log.debug(`Thinking length: ${thinking.length} chars`);
    }
    if (toolCalls.length > 0) {
      log.info(`Model requested ${toolCalls.length} tool calls: ${toolCalls.map(tc => tc.name).join(', ')}`);
    }
    
    return { reply, thinking, toolCalls };
    
  } catch (error) {
    log.error('Failed to generate model chat response:', error);
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Update memory based on conversation
 */
export function updateMemoryFromConversation(
  existingMemory: Memory | null,
  persona: Persona | null,
  turn: ConversationTurn,
  reply: string
): Memory {
  const memory = existingMemory || {
    summary: 'New agent with default configuration',
    key_facts: [],
    recent_context: [],
    updatedAt: Date.now(),
  };
  
  // Update summary if it's the default
  if (memory.summary === 'New agent with default configuration' && persona) {
    memory.summary = `Agent "${persona.name}" configured as ${persona.role}.`;
  }
  
  // Add conversation to recent context
  const conversationSummary = `Conversation with ${turn.speaker}: ${turn.message.substring(0, 100)}${turn.message.length > 100 ? '...' : ''}`;
  memory.recent_context.push(conversationSummary);
  
  // Keep only last 10 context items
  if (memory.recent_context.length > 10) {
    memory.recent_context = memory.recent_context.slice(-10);
  }
  
  // Update timestamp
  memory.updatedAt = Date.now();
  
  return memory;
}