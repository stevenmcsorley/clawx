/**
 * Operation-Scoped Streaming
 * 
 * Provides operation-scoped event routing to prevent cross-talk
 * between overlapping operations on the same worker.
 */

import { StreamingManager, StreamingClient } from './streaming-client.js';
import { log } from './logger.js';
import type { StreamEvent } from './streaming-events.js';

export interface OperationScope {
  operationId: string;
  operationType: 'chat' | 'task';
  agentId: string;
  agentName: string;
  endpoint: string;
  onEvent?: (event: StreamEvent & { agentId: string; agentName: string }) => void;
}

export interface OperationClient {
  operationId: string;
  operationType: 'chat' | 'task';
  agentId: string;
  client: StreamingClient;
  handler: (event: StreamEvent) => void;
  unsubscribe: () => void;
}

/**
 * Operation-scoped streaming manager
 * 
 * Key improvements over basic StreamingManager:
 * 1. Multiple operations can subscribe to same worker without conflict
 * 2. Events are filtered by operationId before being delivered
 * 3. Cleanup is operation-scoped, not agent-scoped
 */
export class OperationScopedStreamingManager {
  private streamingManager = new StreamingManager();
  private operationClients = new Map<string, OperationClient>();
  private agentOperationMap = new Map<string, Set<string>>(); // agentId → Set<operationId>
  
  /**
   * Subscribe to worker events for a specific operation
   */
  subscribeForOperation(options: OperationScope): OperationClient {
    const { operationId, operationType, agentId, agentName, endpoint, onEvent } = options;
    
    log.debug(`Subscribing to events for operation ${operationId} (type: ${operationType}) on agent ${agentName}`);
    
    // Create operation-scoped event handler
    const operationScopedHandler = (event: StreamEvent) => {
      // Filter events by operationId and operationType (event doesn't have agent info yet)
      if (!this.eventBelongsToOperation(event, operationId, operationType)) {
        return; // Ignore unrelated events
      }
      
      log.debug(`Operation ${operationId} received event: ${event.type}`);
      
      // Pass to operation-specific handler with agent info
      if (onEvent) {
        onEvent({ ...event, agentId, agentName });
      }
    };
    
    // Subscribe to agent (may reuse existing connection)
    const client = this.streamingManager.subscribeToAgent(
      agentId,
      agentName,
      endpoint,
      operationScopedHandler
    );
    
    // Track operation with handler reference for cleanup
    const operationClient: OperationClient = {
      operationId,
      operationType,
      agentId,
      client,
      handler: operationScopedHandler,
      unsubscribe: () => this.unsubscribeFromOperation(operationId),
    };
    
    this.operationClients.set(operationId, operationClient);
    
    // Track agent-operation mapping
    if (!this.agentOperationMap.has(agentId)) {
      this.agentOperationMap.set(agentId, new Set());
    }
    this.agentOperationMap.get(agentId)!.add(operationId);
    
    return operationClient;
  }
  
  /**
   * Unsubscribe from events for a specific operation
   */
  unsubscribeFromOperation(operationId: string): void {
    const operationClient = this.operationClients.get(operationId);
    if (!operationClient) {
      return;
    }
    
    log.debug(`Unsubscribing from events for operation ${operationId}`);
    
    // Remove handler from client
    operationClient.client.removeEventHandler(operationClient.handler);
    
    // Remove from agent-operation mapping
    const agentOperations = this.agentOperationMap.get(operationClient.agentId);
    if (agentOperations) {
      agentOperations.delete(operationId);
      if (agentOperations.size === 0) {
        this.agentOperationMap.delete(operationClient.agentId);
        // No more operations for this agent, check if client should be disconnected
        if (!operationClient.client.hasEventHandlers()) {
          this.streamingManager.unsubscribeFromAgent(operationClient.agentId);
        }
      }
    }
    
    // Remove operation client
    this.operationClients.delete(operationId);
  }
  
  /**
   * Check if an event belongs to a specific operation (with type checking)
   */
  private eventBelongsToOperation(event: StreamEvent, operationId: string, operationType: 'chat' | 'task'): boolean {
    // Canonical path: use explicit parent operation fields
    if ('parentOperationId' in event && event.parentOperationId && 
        'parentOperationType' in event && event.parentOperationType) {
      return event.parentOperationId === operationId && 
             event.parentOperationType === operationType;
    }
    
    // Reject events without parent operation fields - they cannot be routed to operations
    // This ensures we don't rely on legacy field overloading
    return false;
  }
  
  /**
   * Get all active operations for an agent
   */
  getOperationsForAgent(agentId: string): string[] {
    const operations = this.agentOperationMap.get(agentId);
    return operations ? Array.from(operations) : [];
  }
  
  /**
   * Get operation client
   */
  getOperationClient(operationId: string): OperationClient | undefined {
    return this.operationClients.get(operationId);
  }
  
  /**
   * Clean up all operations
   */
  cleanup(): void {
    for (const operationId of this.operationClients.keys()) {
      this.unsubscribeFromOperation(operationId);
    }
  }
}