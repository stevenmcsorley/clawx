import { WorkerClient } from '../src/core/grpc/worker-client';

async function runWorkerExample(workerId: string, agentType: string = 'specialist') {
  console.log(`Starting Worker ${workerId} (${agentType})...\n`);
  
  const worker = new WorkerClient(
    {
      workerId,
      agentType,
      capabilities: ['chat', 'tools', 'reasoning'],
      masterAddress: 'localhost:50051',
      reconnectDelay: 3000,
      maxReconnectAttempts: 5,
    },
    {
      onMessage: (frame) => {
        console.log(`[${workerId}] Received message from ${frame.fromAgent}:`);
        console.log(`  Type: ${frame.type}`);
        console.log(`  Content: ${frame.content.substring(0, 100)}${frame.content.length > 100 ? '...' : ''}`);
        console.log('');
        
        // If this is a chat message, respond
        if (frame.type === 'chat_chunk' && frame.fromAgent !== workerId) {
          setTimeout(() => {
            const response = `Hello from ${workerId}! I received your message: "${frame.content.substring(0, 50)}..."`;
            worker.sendChatMessage(
              frame.conversationId,
              frame.fromAgent,
              response
            );
            console.log(`[${workerId}] Sent response to ${frame.fromAgent}`);
          }, 1000);
        }
      },
      onError: (error) => {
        console.error(`[${workerId}] Error:`, error.message);
      },
      onConnected: () => {
        console.log(`[${workerId}] Connected to master`);
      },
      onDisconnected: () => {
        console.log(`[${workerId}] Disconnected from master`);
      },
    }
  );
  
  // Simulate sending a message every 30 seconds
  setInterval(() => {
    if (worker.isConnectedToMaster()) {
      const conversationId = `conv_${Date.now()}`;
      const message = `Hello from ${workerId} at ${new Date().toISOString()}`;
      
      worker.sendChatMessage(
        conversationId,
        'broadcast', // Send to all
        message
      );
      
      console.log(`[${workerId}] Sent broadcast message`);
    }
  }, 30000);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(`\nShutting down worker ${workerId}...`);
    worker.disconnect();
    process.exit(0);
  });
  
  // Keep the process alive
  setInterval(() => {
    // Just keep alive
  }, 1000);
}

// Run with command line argument or default
const workerId = process.argv[2] || `worker_${Math.random().toString(36).substr(2, 6)}`;
const agentType = process.argv[3] || 'specialist';

runWorkerExample(workerId, agentType).catch(console.error);