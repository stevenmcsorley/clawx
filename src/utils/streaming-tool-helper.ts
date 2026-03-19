/**
 * Streaming Tool Helper for Master
 * 
 * Provides utilities for master tools to subscribe to worker events
 * and display live streaming output.
 */

import { OperationScopedStreamingManager } from './operation-scoped-streaming.js';
import { log } from './logger.js';
import type { StreamEvent } from './streaming-events.js';

export interface StreamingOptions {
  endpoint: string;
  agentId: string;
  agentName: string;
  operationId: string;
  onUpdate?: (update: any) => void;
  signal?: AbortSignal;
}

export interface StreamingResult {
  finalResult: any;
  events: StreamEvent[];
}

/**
 * Subscribe to worker events and handle streaming display
 */
export async function withWorkerStreaming(
  options: StreamingOptions,
  operation: () => Promise<any>
): Promise<StreamingResult> {
  const { endpoint, agentId, agentName, operationId, onUpdate, signal } = options;
  
  const events: StreamEvent[] = [];
  let operationClient: ReturnType<OperationScopedStreamingManager['subscribeForOperation']> | null = null;
  
  // Create operation-scoped streaming manager
  const streamingManager = new OperationScopedStreamingManager();
  
  // Operation-scoped event handler
  const eventHandler = (event: StreamEvent & { agentId: string; agentName: string }) => {
    events.push(event);
    handleEvent(event, onUpdate, operationId);
  };
  
  try {
    // Subscribe to worker events for this specific operation
    operationClient = streamingManager.subscribeForOperation({
      operationId,
      agentId,
      agentName,
      endpoint,
      onEvent: eventHandler,
    });
    
    // Wait a moment for connection
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Execute the operation (chat or task)
    const finalResult = await operation();
    
    // Wait a bit more for any final events
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return { finalResult, events };
    
  } finally {
    // Clean up operation-specific subscription
    if (operationClient) {
      operationClient.unsubscribe();
    }
  }
}

/**
 * Handle and display streaming events
 */
function handleEvent(event: StreamEvent, onUpdate?: (update: any) => void, operationId?: string): void {
  switch (event.type) {
    case 'agent_message_start':
      console.log(`\n💬 ${event.persona?.name || 'Agent'} (${event.persona?.role || 'Assistant'}):`);
      break;
      
    case 'agent_message_delta':
      process.stdout.write(event.delta);
      break;
      
    case 'agent_message_end':
      console.log('\n'); // End of message
      break;
      
    case 'task_started':
      console.log(`\n🔄 Task started: ${event.tool} ${formatParams(event.params)}`);
      break;
      
    case 'tool_started':
      console.log(`  🔧 ${event.toolName} ${formatParams(event.params)}`);
      break;
      
    case 'tool_stdout':
      if (event.data.trim()) {
        console.log(`    📤 ${event.data}`);
      }
      break;
      
    case 'tool_stderr':
      if (event.data.trim()) {
        console.log(`    ❗ ${event.data}`);
      }
      break;
      
    case 'tool_finished':
      console.log(`  ✅ Tool completed`);
      break;
      
    case 'task_completed':
      console.log(`\n✅ Task completed`);
      break;
      
    case 'task_failed':
      console.log(`\n❌ Task failed: ${event.error}`);
      break;
      
    case 'task_cancelled':
      console.log(`\n⏹️ Task cancelled`);
      break;
  }
  
  // Pass to onUpdate callback if provided
  if (onUpdate) {
    onUpdate(event);
  }
}

/**
 * Format parameters for display
 */
function formatParams(params: any): string {
  if (!params || Object.keys(params).length === 0) {
    return '';
  }
  
  const str = JSON.stringify(params);
  if (str.length > 50) {
    return str.substring(0, 47) + '...';
  }
  return str;
}

/**
 * Simple streaming display for CLI tools
 */
export function displayStreamingEvents(events: StreamEvent[]): void {
  for (const event of events) {
    handleEvent(event);
  }
}