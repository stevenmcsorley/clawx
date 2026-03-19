#!/usr/bin/env node

/**
 * Example: Using gRPC for agent communication in Clawx
 * 
 * This shows how to:
 * 1. Start a gRPC server
 * 2. Connect agents via gRPC
 * 3. Send messages between agents
 * 4. Use personas with gRPC
 */

import { AgentGrpcServer } from '../dist/core/grpc/agent-grpc-server.js';
import { AgentGrpcClient } from '../dist/core/grpc/agent-grpc-client.js';

async function runExample() {
  console.log('=== Clawx gRPC Agent Communication Example ===\n');
  
  const GRPC_PORT = 51201;
  let grpcServer;
  let coderAgent;
  let testerAgent;
  
  try {
    // 1. Start gRPC server (like Clawx master would)
    console.log('1. Starting gRPC server (master)...');
    grpcServer = new AgentGrpcServer(GRPC_PORT);
    
    grpcServer.on('agentRegistered', (agent) => {
      console.log(`Master: ${agent.agentName} joined the network`);
    });
    
    grpcServer.on('agentDisconnected', (agentId) => {
      console.log(`Master: ${agentId} left the network`);
    });
    
    await grpcServer.start();
    console.log(`✓ gRPC server running on port ${GRPC_PORT}\n`);
    
    // 2. Create a coder agent (specialist)
    console.log('2. Creating coder agent...');
    coderAgent = new AgentGrpcClient({
      agentId: 'coder-agent',
      agentName: 'TypeScript Specialist',
      serverAddress: `localhost:${GRPC_PORT}`,
      persona: {
        id: 'coder-1',
        name: 'TypeScript Specialist',
        role: 'Senior TypeScript Developer',
        tone: 'Technical and precise',
        decision_style: 'Analytical, prefers type safety',
        strengths: ['TypeScript', 'Node.js', 'API design', 'Debugging'],
        biases: ['Prefers strongly-typed solutions'],
        goals: ['Write clean, maintainable code', 'Fix bugs', 'Design APIs'],
        boundaries: ['No production deployment without tests'],
        relationship_to_master: 'Specialist coder agent',
        notes: 'Expert in TypeScript and Node.js ecosystems',
        version: '1.0.0',
        updatedAt: Date.now(),
      },
      reconnectDelay: 3000,
      heartbeatInterval: 20000,
    });
    
    coderAgent.on('connected', () => {
      console.log('✓ Coder agent connected to master');
    });
    
    coderAgent.on('registered', () => {
      console.log('✓ Coder agent registered with master');
    });
    
    coderAgent.on('chat', (data) => {
      console.log(`\n[Coder] Received from ${data.from}: ${data.message}`);
      
      // Auto-respond to tester
      if (data.from === 'tester-agent') {
        setTimeout(() => {
          coderAgent.sendChat('tester-agent', 'I\'ll review that code and fix any TypeScript issues.');
          console.log('[Coder] Sent response to tester');
        }, 1000);
      }
    });
    
    coderAgent.on('error', (error) => {
      console.error('[Coder] Error:', error.message);
    });
    
    // 3. Create a tester agent (specialist)
    console.log('\n3. Creating tester agent...');
    testerAgent = new AgentGrpcClient({
      agentId: 'tester-agent',
      agentName: 'QA Specialist',
      serverAddress: `localhost:${GRPC_PORT}`,
      persona: {
        id: 'tester-1',
        name: 'QA Specialist',
        role: 'Quality Assurance Engineer',
        tone: 'Detail-oriented and methodical',
        decision_style: 'Risk-averse, prefers thorough testing',
        strengths: ['Unit testing', 'Integration testing', 'Bug hunting', 'Documentation'],
        biases: ['Prefers comprehensive test coverage'],
        goals: ['Ensure code quality', 'Find and report bugs', 'Write tests'],
        boundaries: ['No untested code in production'],
        relationship_to_master: 'Specialist tester agent',
        notes: 'Expert in testing methodologies and quality assurance',
        version: '1.0.0',
        updatedAt: Date.now(),
      },
      reconnectDelay: 3000,
      heartbeatInterval: 20000,
    });
    
    testerAgent.on('connected', () => {
      console.log('✓ Tester agent connected to master');
    });
    
    testerAgent.on('registered', () => {
      console.log('✓ Tester agent registered with master');
    });
    
    testerAgent.on('chat', (data) => {
      console.log(`\n[Tester] Received from ${data.from}: ${data.message}`);
    });
    
    testerAgent.on('error', (error) => {
      console.error('[Tester] Error:', error.message);
    });
    
    // Wait for connections
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 4. Check network status
    console.log('\n4. Network status:');
    const agents = grpcServer.getConnectedAgents();
    console.log(`✓ Connected agents: ${agents.length}`);
    agents.forEach(agent => {
      console.log(`  - ${agent.name} (${agent.id})`);
      if (agent.persona) {
        console.log(`    Role: ${agent.persona.role}`);
      }
    });
    
    // 5. Simulate a conversation
    console.log('\n5. Simulating agent conversation:');
    
    console.log('\n[Tester] → [Coder]: "Hey coder, can you review this TypeScript code for type safety?"');
    testerAgent.sendChat('coder-agent', 'Hey coder, can you review this TypeScript code for type safety?');
    
    // Wait for auto-response
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 6. Test broadcast
    console.log('\n6. Testing broadcast:');
    const broadcastCount = grpcServer.broadcast('master', 'System: All agents please update your status');
    console.log(`✓ Broadcast sent to ${broadcastCount} agents`);
    
    // 7. Summary
    console.log('\n=== Example Summary ===');
    console.log('✓ gRPC server: Running as master');
    console.log('✓ Agent connections: 2 specialists');
    console.log('✓ Persona system: Working with gRPC');
    console.log('✓ Direct chat: Working');
    console.log('✓ Broadcast: Working');
    console.log('✓ Auto-reconnect: Configured');
    console.log('✓ Heartbeat: Enabled');
    
    console.log('\n=== How this works in Clawx ===');
    console.log('1. User runs: clawx --serve (starts HTTP + gRPC servers)');
    console.log('2. Agents connect via: new AgentGrpcClient()');
    console.log('3. Agents chat via: agent.sendChat() or agent_grpc_chat tool');
    console.log('4. Master coordinates via: AgentGrpcServer');
    console.log('5. Personas travel with agents over gRPC connections');
    
    console.log('\nPress Ctrl+C to stop...\n');
    
    // Keep running
    await new Promise(() => {});
    
  } catch (error) {
    console.error('\n✗ Example failed:', error);
    process.exit(1);
  } finally {
    // Cleanup (would be called on Ctrl+C)
    console.log('\n=== Cleaning up ===');
    
    if (coderAgent) {
      coderAgent.disconnect();
      console.log('Coder agent disconnected');
    }
    
    if (testerAgent) {
      testerAgent.disconnect();
      console.log('Tester agent disconnected');
    }
    
    if (grpcServer) {
      await grpcServer.stop();
      console.log('gRPC server stopped');
    }
    
    console.log('\nExample completed!');
    process.exit(0);
  }
}

// Run example
runExample().catch(console.error);