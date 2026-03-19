/**
 * Agent WebSocket Server
 * 
 * WebSocket server for real-time agent-to-agent communication
 */

import { WebSocketServer, WebSocket } from 'ws';
import { log } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import type { AgentIdentity } from '../types/agent.js';
import type { Persona } from '../types/persona.js';

export interface WebSocketMessage {
  type: 'chat' | 'presence' | 'error' | 'ack';
  from: string; // Agent ID
  to?: string; // Specific agent ID, or 'broadcast' for all
  message?: string;
  timestamp: number;
  id: string; // Message ID for acknowledgements
  data?: any;
}

export interface AgentConnection {
  ws: WebSocket;
  agentId: string;
  agentName: string;
  persona?: Persona;
  lastSeen: number;
}

export class AgentWebSocketServer {
  private wss: WebSocketServer;
  private connections: Map<string, AgentConnection> = new Map();
  private messageCallbacks: Map<string, (message: WebSocketMessage) => void> = new Map();
  
  constructor(port: number) {
    try {
      log.info(`Creating WebSocket server on port ${port}...`);
      this.wss = new WebSocketServer({ 
        port,
        host: 'localhost'  // Explicitly bind to localhost
      });
      log.info(`WebSocket server created successfully on port ${port}`);
      this.setup();
    } catch (error) {
      log.error(`Failed to create WebSocket server on port ${port}:`, error);
      throw error;
    }
  }
  
  private setup() {
    this.wss.on('connection', (ws: WebSocket) => {
      log.info('New WebSocket connection');
      
      // Send welcome message
      const welcomeMsg: WebSocketMessage = {
        type: 'presence',
        from: 'server',
        to: 'new-client',
        message: 'Welcome to agent chat. Please identify yourself.',
        timestamp: Date.now(),
        id: uuidv4(),
      };
      ws.send(JSON.stringify(welcomeMsg));
      
      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WebSocketMessage;
          this.handleMessage(ws, message);
        } catch (error) {
          log.error('Failed to parse WebSocket message:', error);
          const errorMsg: WebSocketMessage = {
            type: 'error',
            from: 'server',
            to: 'client',
            message: 'Invalid message format',
            timestamp: Date.now(),
            id: uuidv4(),
          };
          ws.send(JSON.stringify(errorMsg));
        }
      });
      
      ws.on('close', () => {
        this.handleDisconnection(ws);
      });
      
      ws.on('error', (error) => {
        log.error('WebSocket error:', error);
        this.handleDisconnection(ws);
      });
    });
    
    this.wss.on('listening', () => {
      log.info(`Agent WebSocket server listening on port ${this.wss.options.port}`);
    });
    
    this.wss.on('error', (error) => {
      log.error('WebSocket server error:', error);
    });
  }
  
  private handleMessage(ws: WebSocket, message: WebSocketMessage) {
    switch (message.type) {
      case 'presence':
        // Agent identifying itself
        if (message.data?.agentId && message.data?.agentName) {
          const connection: AgentConnection = {
            ws,
            agentId: message.data.agentId,
            agentName: message.data.agentName,
            persona: message.data.persona,
            lastSeen: Date.now(),
          };
          this.connections.set(message.data.agentId, connection);
          
          log.info(`Agent ${message.data.agentName} (${message.data.agentId}) connected to WebSocket`);
          
          // Send acknowledgement
          const ack: WebSocketMessage = {
            type: 'ack',
            from: 'server',
            to: message.data.agentId,
            message: 'Identification accepted',
            timestamp: Date.now(),
            id: uuidv4(),
            data: {
              connectedAgents: Array.from(this.connections.values()).map(c => ({
                agentId: c.agentId,
                agentName: c.agentName,
                persona: c.persona,
              })),
            },
          };
          ws.send(JSON.stringify(ack));
          
          // Notify other agents
          this.broadcastPresence(message.data.agentId, message.data.agentName, 'connected');
        }
        break;
        
      case 'chat':
        // Chat message between agents
        if (!this.connections.has(message.from)) {
          const errorMsg: WebSocketMessage = {
            type: 'error',
            from: 'server',
            to: message.from,
            message: 'You must identify yourself before sending chat messages',
            timestamp: Date.now(),
            id: uuidv4(),
          };
          ws.send(JSON.stringify(errorMsg));
          return;
        }
        
        if (message.to === 'broadcast') {
          // Broadcast to all agents except sender
          this.broadcastMessage(message, message.from);
        } else if (message.to) {
          // Send to specific agent
          this.sendToAgent(message.to, message);
        } else {
          // No recipient specified
          const errorMsg: WebSocketMessage = {
            type: 'error',
            from: 'server',
            to: message.from,
            message: 'No recipient specified. Use "to": "broadcast" or specific agent ID',
            timestamp: Date.now(),
            id: uuidv4(),
          };
          ws.send(JSON.stringify(errorMsg));
        }
        break;
        
      case 'ack':
        // Acknowledgement for a message
        if (message.id && this.messageCallbacks.has(message.id)) {
          const callback = this.messageCallbacks.get(message.id)!;
          callback(message);
          this.messageCallbacks.delete(message.id);
        }
        break;
    }
  }
  
  private broadcastMessage(message: WebSocketMessage, excludeAgentId?: string) {
    for (const [agentId, connection] of this.connections) {
      if (agentId === excludeAgentId) continue;
      
      try {
        connection.ws.send(JSON.stringify(message));
      } catch (error) {
        log.error(`Failed to send message to agent ${agentId}:`, error);
      }
    }
  }
  
  private sendToAgent(agentId: string, message: WebSocketMessage) {
    const connection = this.connections.get(agentId);
    if (!connection) {
      // Try to send error back to sender
      const senderConnection = this.connections.get(message.from);
      if (senderConnection) {
        const errorMsg: WebSocketMessage = {
          type: 'error',
          from: 'server',
          to: message.from,
          message: `Agent ${agentId} not found or not connected`,
          timestamp: Date.now(),
          id: uuidv4(),
        };
        senderConnection.ws.send(JSON.stringify(errorMsg));
      }
      return;
    }
    
    try {
      connection.ws.send(JSON.stringify(message));
    } catch (error) {
      log.error(`Failed to send message to agent ${agentId}:`, error);
    }
  }
  
  private broadcastPresence(agentId: string, agentName: string, status: 'connected' | 'disconnected') {
    const presenceMsg: WebSocketMessage = {
      type: 'presence',
      from: 'server',
      to: 'broadcast',
      message: `${agentName} ${status}`,
      timestamp: Date.now(),
      id: uuidv4(),
      data: {
        agentId,
        agentName,
        status,
      },
    };
    
    this.broadcastMessage(presenceMsg, agentId);
  }
  
  private handleDisconnection(ws: WebSocket) {
    // Find which agent disconnected
    let disconnectedAgentId: string | null = null;
    let disconnectedAgentName: string | null = null;
    
    for (const [agentId, connection] of this.connections) {
      if (connection.ws === ws) {
        disconnectedAgentId = agentId;
        disconnectedAgentName = connection.agentName;
        this.connections.delete(agentId);
        break;
      }
    }
    
    if (disconnectedAgentId) {
      log.info(`Agent ${disconnectedAgentName} (${disconnectedAgentId}) disconnected from WebSocket`);
      this.broadcastPresence(disconnectedAgentId, disconnectedAgentName!, 'disconnected');
    }
  }
  
  getConnectedAgents(): Array<{ agentId: string; agentName: string; persona?: Persona }> {
    return Array.from(this.connections.values()).map(c => ({
      agentId: c.agentId,
      agentName: c.agentName,
      persona: c.persona,
    }));
  }
  
  close() {
    this.wss.close();
    this.connections.clear();
    this.messageCallbacks.clear();
  }
}