import { Orchestrator } from '../src/core/grpc/orchestrator';

async function runFullExample() {
  console.log('=== gRPC Agent Communication System ===\n');
  
  // Create orchestrator (master + workers)
  const orchestrator = new Orchestrator({
    masterId: 'master-1',
    port: 50051,
    localWorkers: [
      {
        id: 'worker-a1',
        agentType: 'coder',
        capabilities: ['typescript', 'python', 'debugging'],
      },
      {
        id: 'worker-a2',
        agentType: 'tester',
        capabilities: ['unit-testing', 'integration-testing', 'qa'],
      },
      {
        id: 'worker-a3',
        agentType: 'documenter',
        capabilities: ['documentation', 'tutorials', 'api-docs'],
      },
    ],
  });
  
  // Start the orchestrator
  await orchestrator.start();
  
  console.log('\n=== System Status ===');
  console.log(`Master: master-1 (port 50051)`);
  console.log(`Local workers: ${orchestrator.getWorkerCount()}`);
  console.log(`Remote workers: ${orchestrator.getRemoteWorkerCount()}`);
  console.log(`Master connections: ${orchestrator.getMasterConnectionCount()}`);
  
  // Set up event listeners
  orchestrator.on('workerConnected', (workerId: string) => {
    console.log(`\n[EVENT] Worker connected: ${workerId}`);
  });
  
  orchestrator.on('workerDisconnected', (workerId: string) => {
    console.log(`\n[EVENT] Worker disconnected: ${workerId}`);
  });
  
  orchestrator.on('routingTableUpdated', (routingTable: Map<string, any>) => {
    console.log('\n[EVENT] Routing table updated:');
    routingTable.forEach((info, workerId) => {
      console.log(`  ${workerId} -> ${info.local ? 'local' : `remote via ${info.masterId}`}`);
    });
  });
  
  // Simulate some chat messages
  setTimeout(() => {
    console.log('\n=== Simulating Chat ===');
    orchestrator.sendChatMessage(
      'worker-a1',
      'worker-a2',
      'Hey tester, can you review this code I just wrote?'
    );
    
    setTimeout(() => {
      orchestrator.sendChatMessage(
        'worker-a2',
        'worker-a1',
        'Sure! Send it over and I\'ll run the tests.'
      );
      
      setTimeout(() => {
        orchestrator.sendChatMessage(
          'worker-a1',
          'worker-a3',
          'Can you document the new API endpoints I created?'
        );
      }, 2000);
    }, 2000);
  }, 5000);
  
  // Display status periodically
  setInterval(() => {
    console.log('\n=== Periodic Status ===');
    console.log(`Local workers: ${orchestrator.getWorkerCount()}`);
    console.log(`Remote workers: ${orchestrator.getRemoteWorkerCount()}`);
    console.log(`Total known workers: ${orchestrator.getWorkerCount() + orchestrator.getRemoteWorkerCount()}`);
    
    const routingTable = orchestrator.getRoutingTable();
    if (routingTable.size > 0) {
      console.log('Routing table:');
      routingTable.forEach((info, workerId) => {
        console.log(`  ${workerId.padEnd(15)} [${info.local ? 'LOCAL' : 'REMOTE'}]`);
      });
    }
  }, 15000);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n=== Shutting Down ===');
    await orchestrator.stop();
    console.log('System stopped gracefully');
    process.exit(0);
  });
  
  console.log('\n=== System Running ===');
  console.log('Press Ctrl+C to stop\n');
}

// Run the example
runFullExample().catch(console.error);