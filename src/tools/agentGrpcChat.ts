/**
 * Agent gRPC Chat Tool for Clawx
 * 
 * Tool for agents to chat with each other via gRPC
 * Replaces the WebSocket chat tool
 */

import { z } from 'zod';
import { log } from '../utils/logger.js';
import type { AgentConfig, AgentTask } from '../types/agent.js';
// import type { EventStream } from '../utils/streaming-events.js';
import type { GrpcServer } from '../core/grpc/grpc-server.js';

export function createAgentGrpcChatTool(
  config: AgentConfig,
  grpcServer: GrpcServer,
  tasks: Map<string, AgentTask>
) {
  return {
    name: 'agent_grpc_chat',
    description: 'Chat with another agent via gRPC. Use this for real-time agent-to-agent communication.',
    schema: z.object({
      toAgent: z.string().describe('ID of the agent to chat with, or "broadcast" for all agents'),
      message: z.string().describe('Message to send'),
      conversationId: z.string().optional().describe('Optional conversation ID for tracking'),
      waitForReply: z.boolean().default(false).describe('Wait for a reply from the other agent'),
      timeout: z.number().default(30000).describe('Timeout in milliseconds when waiting for reply'),
    }),
    async execute(params: any, context: any) {
      const { toAgent, message, conversationId, waitForReply, timeout } = params;
      
      log.info(`Agent ${config.id} chatting with ${toAgent} via gRPC: ${message.substring(0, 100)}...`);
      
      let result: any = {
        sent: true,
        toAgent,
        message: 'Chat sent via gRPC',
        timestamp: Date.now(),
      };
      
      if (toAgent === 'broadcast') {
        // Broadcast to all agents
        const count = grpcServer.broadcast(config.id, message);
        result.broadcast = true;
        result.recipients = count;
        result.message = `Broadcast sent to ${count} agents`;
        
        log.info(`Broadcast message sent to ${count} agents`);
        return result;
      }
      
      // Send to specific agent
      const sent = grpcServer.sendChat(config.id, toAgent, message, conversationId);
      
      if (!sent) {
        throw new Error(`Agent ${toAgent} not found or not connected via gRPC`);
      }
      
      log.info(`Message sent to agent ${toAgent} via gRPC`);
      
      if (waitForReply) {
        // Wait for reply (simplified implementation)
        // In a full implementation, this would use promises and event listeners
        result.note = 'Reply waiting would be implemented with event listeners';
        result.suggestion = 'Use separate chat messages for conversation flow';
      }
      
      return result;
    },
  };
}