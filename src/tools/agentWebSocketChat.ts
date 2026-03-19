/**
 * Agent WebSocket Chat Tool
 * 
 * Connect to WebSocket server and chat with other agents in real-time
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { log } from "../utils/logger.js";
import WebSocket from 'ws';

const AgentWebSocketChatSchema = Type.Object({
  action: Type.Union([
    Type.Literal("connect"),
    Type.Literal("send"),
    Type.Literal("disconnect"),
    Type.Literal("list"),
  ], { description: "Action to perform" }),
  wsUrl: Type.Optional(
    Type.String({ description: "WebSocket URL (e.g., ws://localhost:44301)" })
  ),
  message: Type.Optional(
    Type.String({ description: "Message to send (for 'send' action)" })
  ),
  to: Type.Optional(
    Type.String({ description: "Agent ID to send to, or 'broadcast' for all", default: "broadcast" })
  ),
  agentId: Type.Optional(
    Type.String({ description: "Your agent ID (for identification)" })
  ),
  agentName: Type.Optional(
    Type.String({ description: "Your agent name (for identification)" })
  ),
});

type AgentWebSocketChatInput = Static<typeof AgentWebSocketChatSchema>;

// Global WebSocket connection store
const wsConnections = new Map<string, WebSocket>();

export function createAgentWebSocketChatTool(
  defaultCwd: string,
): AgentTool<typeof AgentWebSocketChatSchema> {
  return {
    name: "agent_ws_chat",
    label: "Agent WebSocket Chat",
    description: "Real-time chat with other agents via WebSocket",
    parameters: AgentWebSocketChatSchema,
    async execute(
      _toolCallId: string,
      params: AgentWebSocketChatInput,
    ): Promise<AgentToolResult<unknown>> {
      const { action, wsUrl, message, to = "broadcast", agentId, agentName } = params;
      
      switch (action) {
        case "connect":
          return await handleConnect(wsUrl, agentId, agentName);
        case "send":
          return await handleSend(message, to);
        case "disconnect":
          return await handleDisconnect();
        case "list":
          return await handleList();
        default:
          return {
            content: [{
              type: "text",
              text: `error: Unknown action: ${action}`,
            }],
            details: { error: "Unknown action" },
          };
      }
    },
  };
}

async function handleConnect(
  wsUrl: string | undefined,
  agentId: string | undefined,
  agentName: string | undefined
): Promise<AgentToolResult<unknown>> {
  if (!wsUrl) {
    return {
      content: [{
        type: "text",
        text: "error: WebSocket URL required for connect action",
      }],
      details: { error: "Missing wsUrl parameter" },
    };
  }
  
  if (!agentId || !agentName) {
    return {
      content: [{
        type: "text",
        text: "error: agentId and agentName required for identification",
      }],
      details: { error: "Missing agentId or agentName" },
    };
  }
  
  // Close existing connection if any
  if (wsConnections.has(agentId)) {
    const existingWs = wsConnections.get(agentId)!;
    existingWs.close();
    wsConnections.delete(agentId);
  }
  
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(wsUrl);
      
      ws.on('open', () => {
        log.info(`WebSocket connected to ${wsUrl}`);
        
        // Identify ourselves
        const identifyMsg = {
          type: 'presence' as const,
          from: agentId,
          to: 'server',
          message: 'Identification',
          timestamp: Date.now(),
          id: `identify-${Date.now()}`,
          data: {
            agentId,
            agentName,
          },
        };
        
        ws.send(JSON.stringify(identifyMsg));
        
        // Store connection
        wsConnections.set(agentId, ws);
        
        // Set up message handler
        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            log.info(`WebSocket message received: ${JSON.stringify(message, null, 2)}`);
          } catch (error) {
            log.error('Failed to parse WebSocket message:', error);
          }
        });
        
        resolve({
          content: [{
            type: "text",
            text: `✅ Connected to WebSocket server at ${wsUrl}\nWaiting for identification acknowledgement...`,
          }],
          details: {
            connected: true,
            wsUrl,
            agentId,
            agentName,
          },
        });
      });
      
      ws.on('error', (error) => {
        log.error('WebSocket connection error:', error);
        resolve({
          content: [{
            type: "text",
            text: `error: WebSocket connection failed: ${error.message}`,
          }],
          details: { 
            error: "WebSocket connection failed",
            wsUrl,
            connection_error: error.message,
          },
        });
      });
      
      ws.on('close', () => {
        log.info('WebSocket connection closed');
        wsConnections.delete(agentId);
      });
      
    } catch (error) {
      resolve({
        content: [{
          type: "text",
          text: `error: Failed to create WebSocket connection: ${error instanceof Error ? error.message : String(error)}`,
        }],
        details: { 
          error: "WebSocket creation failed",
          wsUrl,
          creation_error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}

async function handleSend(
  message: string | undefined,
  to: string
): Promise<AgentToolResult<unknown>> {
  if (!message) {
    return {
      content: [{
        type: "text",
        text: "error: Message required for send action",
      }],
      details: { error: "Missing message parameter" },
    };
  }
  
  // Find any active connection
  if (wsConnections.size === 0) {
    return {
      content: [{
        type: "text",
        text: "error: Not connected to any WebSocket server. Use 'connect' action first.",
      }],
      details: { error: "No WebSocket connection" },
    };
  }
  
  // Use the first connection (agents typically have one connection)
  const [agentId, ws] = Array.from(wsConnections.entries())[0];
  
  const chatMsg = {
    type: 'chat' as const,
    from: agentId,
    to,
    message,
    timestamp: Date.now(),
    id: `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
  
  try {
    ws.send(JSON.stringify(chatMsg));
    
    return {
      content: [{
        type: "text",
        text: `✅ Message sent to ${to}:\n"${message}"`,
      }],
      details: {
        sent: true,
        to,
        message,
        timestamp: chatMsg.timestamp,
        messageId: chatMsg.id,
      },
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `error: Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
      }],
      details: { 
        error: "Message send failed",
        to,
        message,
        send_error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function handleDisconnect(): Promise<AgentToolResult<unknown>> {
  if (wsConnections.size === 0) {
    return {
      content: [{
        type: "text",
        text: "error: Not connected to any WebSocket server",
      }],
      details: { error: "No WebSocket connection" },
    };
  }
  
  const disconnected: Array<{ agentId: string; wsUrl?: string }> = [];
  
  for (const [agentId, ws] of wsConnections.entries()) {
    ws.close();
    disconnected.push({ agentId });
  }
  
  wsConnections.clear();
  
  return {
    content: [{
      type: "text",
      text: `✅ Disconnected from WebSocket server(s). Disconnected agents: ${disconnected.map(d => d.agentId).join(', ')}`,
    }],
    details: {
      disconnected: true,
      disconnectedAgents: disconnected,
    },
  };
}

async function handleList(): Promise<AgentToolResult<unknown>> {
  const connections = Array.from(wsConnections.entries()).map(([agentId, ws]) => ({
    agentId,
    readyState: ws.readyState,
    readyStateText: getReadyStateText(ws.readyState),
  }));
  
  let output = `## WebSocket Connections (${connections.length})\n\n`;
  
  if (connections.length === 0) {
    output += "No active WebSocket connections.\n";
  } else {
    for (const conn of connections) {
      output += `- **${conn.agentId}**: ${conn.readyStateText}\n`;
    }
  }
  
  output += `\nUse 'connect' to connect to a WebSocket server.\n`;
  output += `Use 'send' to send messages.\n`;
  output += `Use 'disconnect' to close connections.\n`;
  
  return {
    content: [{
      type: "text",
      text: output,
    }],
    details: {
      connections,
      count: connections.length,
    },
  };
}

function getReadyStateText(readyState: number): string {
  switch (readyState) {
    case WebSocket.CONNECTING: return "Connecting";
    case WebSocket.OPEN: return "Open";
    case WebSocket.CLOSING: return "Closing";
    case WebSocket.CLOSED: return "Closed";
    default: return `Unknown (${readyState})`;
  }
}