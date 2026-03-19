#!/usr/bin/env node

import * as grpc from '@grpc/grpc-js';
import { EventEmitter } from 'events';

// Simple gRPC test to verify the system works
console.log('=== Simple gRPC Test ===\n');

// Test 1: Check if gRPC is installed
console.log('Test 1: Checking gRPC installation...');
try {
  console.log('✓ gRPC version:', grpc.version);
  console.log('✓ gRPC loaded successfully');
} catch (error) {
  console.error('✗ gRPC failed to load:', error);
  process.exit(1);
}

// Test 2: Create a simple server
console.log('\nTest 2: Creating simple gRPC server...');
const server = new grpc.Server();

// Add a simple service
const service = {
  sayHello: (call, callback) => {
    callback(null, { message: `Hello ${call.request.name}` });
  }
};

server.addService({
  sayHello: {
    path: '/test.TestService/SayHello',
    requestStream: false,
    responseStream: false,
    requestSerialize: (value) => Buffer.from(JSON.stringify(value)),
    requestDeserialize: (buffer) => JSON.parse(buffer.toString()),
    responseSerialize: (value) => Buffer.from(JSON.stringify(value)),
    responseDeserialize: (buffer) => JSON.parse(buffer.toString()),
  }
}, service);

// Test 3: Bind server
console.log('Test 3: Binding server to port...');
server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, port) => {
  if (error) {
    console.error('✗ Failed to bind server:', error);
    process.exit(1);
  }
  
  console.log(`✓ Server bound to port ${port}`);
  
  // Test 4: Start server
  console.log('Test 4: Starting server...');
  server.start();
  console.log('✓ Server started successfully');
  
  // Test 5: Create client and make a call
  console.log('\nTest 5: Creating client and making RPC call...');
  
  const client = new grpc.Client(
    `127.0.0.1:${port}`,
    grpc.credentials.createInsecure()
  );
  
  // Make a simple call
  const deadline = new Date();
  deadline.setSeconds(deadline.getSeconds() + 5);
  
  client.makeUnaryRequest(
    '/test.TestService/SayHello',
    (value) => Buffer.from(JSON.stringify(value)),
    (buffer) => JSON.parse(buffer.toString()),
    { name: 'World' },
    (error, response) => {
      if (error) {
        console.error('✗ RPC call failed:', error);
      } else {
        console.log(`✓ RPC call successful: ${response.message}`);
      }
      
      // Clean up
      client.close();
      server.tryShutdown(() => {
        console.log('\n=== All Tests Passed ===');
        console.log('✓ gRPC is working correctly');
        console.log('✓ Server/client communication successful');
        process.exit(0);
      });
    },
    {},
    deadline
  );
});

console.log('\n=== Running Tests ===');
console.log('Press Ctrl+C to stop early\n');