// Run agent server directly with debugging
import { startAgentServer } from './dist/core/agent-server.js';
import { setLogLevel } from './dist/utils/logger.js';

// Enable debug logging
setLogLevel('debug');

const config = {
  id: 'debug-agent',
  name: 'DebugAgent',
  port: 44201,
  workspace: './debug-workspace',
  allowedTools: [], // Empty array means all tools
  masterEndpoint: 'http://localhost:44100',
};

console.log('Starting debug agent server...');
console.log('Config:', JSON.stringify(config, null, 2));

try {
  const server = await startAgentServer(config);
  console.log(`✅ Agent server started on port ${server.port}`);
  console.log(`WebSocket port: ${server.wsPort}`);
  
  // Check health endpoint
  const response = await fetch(`http://localhost:${server.port}/health`);
  const health = await response.json();
  console.log('Health endpoint:', JSON.stringify(health, null, 2));
  
  // Keep server running
  console.log('\nAgent server running. Press Ctrl+C to stop.');
  
  // Don't auto-exit
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    server.close();
    process.exit(0);
  });
  
} catch (error) {
  console.error('❌ Failed to start agent server:', error);
  process.exit(1);
}