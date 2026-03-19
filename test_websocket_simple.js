// Simple WebSocket test
import { WebSocket } from 'ws';

// Test connecting to a WebSocket server
const wsUrl = 'ws://localhost:45103'; // John_Fixed's WebSocket port

console.log(`Testing WebSocket connection to ${wsUrl}...`);

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('✅ WebSocket connection opened!');
  
  // Send a simple message
  const msg = {
    type: 'presence',
    from: 'test-client',
    to: 'server',
    message: 'Hello from test',
    timestamp: Date.now(),
    id: 'test-' + Date.now(),
  };
  
  ws.send(JSON.stringify(msg));
  console.log('Sent test message');
});

ws.on('message', (data) => {
  console.log('📨 Received:', data.toString());
});

ws.on('error', (error) => {
  console.log('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('🔌 WebSocket connection closed');
});

// Timeout
setTimeout(() => {
  console.log('⏰ Test complete');
  ws.close();
  process.exit(0);
}, 5000);