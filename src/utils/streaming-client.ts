/**
 * Streaming Client for Master
 * 
 * Subscribes to worker event streams and forwards events to TUI.
 */

import { EventEmitter } from 'events';
import { log } from './logger.js';
import type { StreamEvent } from './streaming-events.js';

export interface StreamClientOptions {
  endpoint: string;
  agentId: string;
  agentName: string;
  onEvent?: (event: StreamEvent) => void;
}

export class StreamingClient extends EventEmitter {
  private endpoint: string;
  private agentId: string;
  private agentName: string;
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnected = false;
  private eventHandlers = new Set<(event: StreamEvent) => void>();
  
  constructor(options: StreamClientOptions) {
    super();
    this.endpoint = options.endpoint;
    this.agentId = options.agentId;
    this.agentName = options.agentName;
    
    if (options.onEvent) {
      this.addEventHandler(options.onEvent);
    }
  }
  
  /**
   * Add an event handler
   */
  addEventHandler(handler: (event: StreamEvent) => void): void {
    this.on('event', handler);
    this.eventHandlers.add(handler);
  }
  
  /**
   * Remove an event handler
   */
  removeEventHandler(handler: (event: StreamEvent) => void): void {
    this.off('event', handler);
    this.eventHandlers.delete(handler);
  }
  
  /**
   * Remove all event handlers
   */
  removeAllEventHandlers(): void {
    for (const handler of this.eventHandlers) {
      this.off('event', handler);
    }
    this.eventHandlers.clear();
  }
  
  /**
   * Check if there are any active event handlers
   */
  hasEventHandlers(): boolean {
    return this.eventHandlers.size > 0;
  }
  
  /**
   * Connect to worker event stream
   */
  connect(): void {
    if (this.eventSource) {
      this.disconnect();
    }
    
    const eventsUrl = `${this.endpoint}/events`;
    log.info(`Connecting to agent event stream: ${eventsUrl}`);
    
    try {
      this.eventSource = new EventSource(eventsUrl);
      
      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('connected', { agentId: this.agentId, agentName: this.agentName });
        log.debug(`Connected to agent event stream: ${this.agentName}`);
      };
      
      this.eventSource.onmessage = (event) => {
        try {
          const streamEvent: StreamEvent = JSON.parse(event.data);
          this.emit('event', streamEvent);
        } catch (error) {
          log.error('Failed to parse event:', error, event.data);
        }
      };
      
      this.eventSource.onerror = (error) => {
        log.error(`Event stream error for agent ${this.agentName}:`, error);
        this.isConnected = false;
        this.emit('disconnected', { agentId: this.agentId, agentName: this.agentName, error });
        
        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
          log.info(`Reconnecting to ${this.agentName} in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          
          setTimeout(() => {
            if (this.eventSource?.readyState === EventSource.CLOSED) {
              this.connect();
            }
          }, delay);
        } else {
          log.error(`Max reconnection attempts reached for agent ${this.agentName}`);
          this.emit('error', { 
            agentId: this.agentId, 
            agentName: this.agentName, 
            error: 'Max reconnection attempts reached' 
          });
        }
      };
      
    } catch (error) {
      log.error(`Failed to create EventSource for ${this.agentName}:`, error);
      this.emit('error', { agentId: this.agentId, agentName: this.agentName, error });
    }
  }
  
  /**
   * Disconnect from event stream
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.isConnected = false;
      this.emit('disconnected', { agentId: this.agentId, agentName: this.agentName });
      log.debug(`Disconnected from agent event stream: ${this.agentName}`);
    }
  }
  
  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }
  
  /**
   * Get agent info
   */
  get agentInfo(): { id: string; name: string; endpoint: string } {
    return {
      id: this.agentId,
      name: this.agentName,
      endpoint: this.endpoint,
    };
  }
}

/**
 * Event stream manager for multiple agents
 */
export class StreamingManager {
  private clients = new Map<string, StreamingClient>();
  private globalEventHandler?: (event: StreamEvent & { agentId: string; agentName: string }) => void;
  
  /**
   * Subscribe to agent events
   */
  subscribeToAgent(
    agentId: string, 
    agentName: string, 
    endpoint: string,
    onEvent?: (event: StreamEvent & { agentId: string; agentName: string }) => void
  ): StreamingClient {
    // Check if we already have a client for this agent
    let client = this.clients.get(agentId);
    
    const eventHandler = onEvent ? (event: StreamEvent) => {
      const enrichedEvent = { ...event, agentId, agentName };
      
      // Call agent-specific handler
      if (onEvent) {
        onEvent(enrichedEvent);
      }
      
      // Call global handler
      if (this.globalEventHandler) {
        this.globalEventHandler(enrichedEvent);
      }
    } : undefined;
    
    if (!client) {
      // Create new client
      client = new StreamingClient({
        endpoint,
        agentId,
        agentName,
        onEvent: eventHandler,
      });
      
      this.clients.set(agentId, client);
      client.connect();
    } else if (eventHandler) {
      // Add additional event handler to existing client
      client.addEventHandler(eventHandler);
    }
    
    return client;
  }
  
  /**
   * Unsubscribe from agent events
   */
  unsubscribeFromAgent(agentId: string): void {
    const client = this.clients.get(agentId);
    if (client) {
      client.disconnect();
      this.clients.delete(agentId);
    }
  }
  
  /**
   * Remove a specific event handler from an agent
   * Note: This is tricky with EventEmitter - we'd need to track handlers
   * For now, we'll keep it simple and just disconnect when no handlers remain
   */
  hasActiveSubscriptions(agentId: string): boolean {
    return this.clients.has(agentId);
  }
  
  /**
   * Set global event handler
   */
  setGlobalEventHandler(handler: (event: StreamEvent & { agentId: string; agentName: string }) => void): void {
    this.globalEventHandler = handler;
  }
  
  /**
   * Get all connected clients
   */
  getClients(): StreamingClient[] {
    return Array.from(this.clients.values());
  }
  
  /**
   * Get client by agent ID
   */
  getClient(agentId: string): StreamingClient | undefined {
    return this.clients.get(agentId);
  }
  
  /**
   * Clean up all connections
   */
  destroy(): void {
    for (const client of this.clients.values()) {
      client.disconnect();
    }
    this.clients.clear();
  }
}