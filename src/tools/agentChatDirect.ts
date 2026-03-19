/**
 * Agent Chat Direct Tool (for workers)
 * 
 * Send a conversational turn directly to another agent by endpoint
 * Workers can use this to chat with other agents if they know the endpoint
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { log } from "../utils/logger.js";
import type { ChatRequest, ChatResponse } from "../types/persona.js";

const AgentChatDirectSchema = Type.Object({
  endpoint: Type.String({ description: "Endpoint of the agent to chat with (e.g., http://localhost:43202)" }),
  message: Type.String({ description: "Message to send to the agent" }),
  mode: Type.Optional(
    Type.String({ description: "Conversation mode (discussion, task, brainstorm, etc.)", default: "discussion" })
  ),
  context: Type.Optional(
    Type.Object({}, { additionalProperties: true, description: "Optional context for the conversation" })
  ),
});

type AgentChatDirectInput = Static<typeof AgentChatDirectSchema>;

export function createAgentChatDirectTool(
  defaultCwd: string,
): AgentTool<typeof AgentChatDirectSchema> {
  return {
    name: "agent_chat_direct",
    label: "Chat with Agent (Direct)",
    description: "Send a conversational turn directly to another agent by endpoint",
    parameters: AgentChatDirectSchema,
    async execute(
      _toolCallId: string,
      params: AgentChatDirectInput,
    ): Promise<AgentToolResult<unknown>> {
      const { endpoint, message, mode = "discussion", context = {} } = params;
      
      log.info(`Agent chat direct: Sending message to ${endpoint}: ${message.substring(0, 100)}...`);
      
      // Check if endpoint is reachable
      try {
        const healthResponse = await fetch(`${endpoint}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        
        if (!healthResponse.ok) {
          return {
            content: [{
              type: "text",
              text: `error: Agent at ${endpoint} is not responding (health check failed, status: ${healthResponse.status})`,
            }],
            details: { 
              error: "Agent health check failed",
              endpoint,
              status: healthResponse.status,
            },
          };
        }
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `error: Cannot connect to agent at ${endpoint}: ${error instanceof Error ? error.message : String(error)}`,
          }],
          details: { 
            error: "Agent connection failed",
            endpoint,
            connection_error: error instanceof Error ? error.message : String(error),
          },
        };
      }
      
      // Prepare chat request
      const chatRequest: ChatRequest = {
        speaker: 'worker', // Indicates this is from another worker, not master
        target: 'unknown', // We don't know the agent ID, just endpoint
        message,
        context,
        mode,
      };
      
      try {
        // Send chat request directly to agent
        const response = await fetch(`${endpoint}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chatRequest),
          signal: AbortSignal.timeout(30000), // 30 second timeout for chat
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Chat request failed (${response.status}): ${errorText}`);
        }
        
        const result = await response.json() as {
          success: boolean;
          turnId: string;
          response: ChatResponse;
          persona?: {
            name: string;
            role: string;
          };
        };
        
        if (!result.success) {
          throw new Error(`Chat failed: ${JSON.stringify(result)}`);
        }
        
        // Build output
        const personaName = result.persona?.name || 'Agent';
        const personaRole = result.persona?.role || 'Assistant';
        
        let output = `\n---\n`;
        output += `💬 Conversation with ${personaName} (${personaRole}) at ${endpoint}\n\n`;
        output += `**You**: ${message}\n\n`;
        output += `**${personaName}**: ${result.response.reply}\n\n`;
        
        if (result.response.notes) {
          output += `---\n`;
          output += `**Notes**: ${JSON.stringify(result.response.notes, null, 2)}\n`;
        }
        
        if (result.response.next_actions && result.response.next_actions.length > 0) {
          output += `**Suggested next actions**: ${result.response.next_actions.join(', ')}\n`;
        }
        
        output += `\n---\n`;
        output += `Turn ID: ${result.turnId}\n`;
        output += `Mode: ${mode}\n`;
        output += `Endpoint: ${endpoint}\n`;
        
        return {
          content: [{
            type: "text",
            text: output,
          }],
          details: {
            success: true,
            turn_id: result.turnId,
            endpoint,
            persona_name: personaName,
            persona_role: personaRole,
            response: result.response,
            mode,
          },
        };
        
      } catch (error) {
        log.error('Direct chat request failed:', error);
        return {
          content: [{
            type: "text",
            text: `error: Direct chat request failed: ${error instanceof Error ? error.message : String(error)}`,
          }],
          details: { 
            error: "Direct chat request failed",
            endpoint,
            chat_error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  };
}