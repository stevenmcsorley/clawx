import { MasterServer } from '../src/core/grpc/master-server';

async function runMasterExample() {
  console.log('Starting Master Server Example...\n');
  
  // Create master server
  const master = new MasterServer('master-1', 50051);
  
  // Start the server
  await master.start();
  
  console.log('Master server is running on port 50051');
  console.log('Press Ctrl+C to stop\n');
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down master server...');
    await master.stop();
    process.exit(0);
  });
  
  // Keep the process alive
  setInterval(() => {
    const workerCount = master.getWorkerCount();
    const masterConnections = master.getMasterConnectionCount();
    
    console.log(`Status: ${workerCount} workers, ${masterConnections} master connections`);
  }, 10000);
}

runMasterExample().catch(console.error);