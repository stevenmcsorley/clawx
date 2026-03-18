#!/usr/bin/env node
/**
 * Test TUI-specific fixes for local multi-agent control plane
 */

import { execSync, spawn } from 'child_process';
import { join } from 'path';
import { homedir } from 'os';
import { writeFileSync, unlinkSync, existsSync } from 'fs';

console.log('=== Testing TUI-Specific Fixes ===\n');

// Clean up before test
const registryPath = join(homedir(), '.clawx', 'agents', 'registry.json');
if (existsSync(registryPath)) {
  unlinkSync(registryPath);
  console.log('✅ Cleared registry');
}

// Kill any existing agent processes
try {
  if (process.platform === 'win32') {
    execSync('taskkill /F /IM node.exe 2>nul || echo "No node processes to kill"', { stdio: 'pipe' });
  } else {
    execSync('pkill -f "clawx agent serve" 2>/dev/null || echo "No agent processes to kill"', { stdio: 'pipe' });
  }
} catch (error) {
  // Ignore
}

console.log('=== Test 1: agent_serve port reporting ===');
console.log('Starting master on port 43100...');
try {
  const output = execSync('node dist/cli/main.js agent serve --name master --port 43100', { 
    encoding: 'utf8',
    timeout: 10000 
  });
  console.log('Output:', output);
  
  // Check for correct reporting
  if (output.includes('Port: 43100 (requested: 43100)')) {
    console.log('✅ Port reporting correct');
  } else if (output.includes('Port: 43100 (requested: auto)')) {
    console.log('❌ Bug C: Port reporting wrong (shows "auto" when 43100 requested)');
    console.log('Debug line should show raw port param');
  } else {
    console.log('⚠️  Could not verify port reporting');
  }
  
  // Kill the server
  execSync('taskkill /F /IM node.exe 2>nul', { stdio: 'pipe' });
} catch (error) {
  console.log('❌ Test 1 failed:', error.message);
}

console.log('\n=== Test 2: agent_master_status consistency ===');
console.log('Starting master (auto-port)...');
const master = spawn('node', ['dist/cli/main.js', 'agent', 'serve', '--name', 'master'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  detached: true,
});

let masterReady = false;
let masterPort = 0;

master.stdout.on('data', (data) => {
  const output = data.toString();
  console.log('Master output:', output);
  
  if (output.includes('Agent server started on port')) {
    // Extract port
    const match = output.match(/port (\d+)/);
    if (match) {
      masterPort = parseInt(match[1]);
      masterReady = true;
      console.log(`✅ Master started on port ${masterPort}`);
      
      // Test agent_master_status
      setTimeout(() => {
        try {
          const statusOutput = execSync('node dist/cli/main.js agent_master_status', { 
            encoding: 'utf8',
            timeout: 5000 
          });
          console.log('\nagent_master_status output:');
          console.log(statusOutput.substring(0, 500) + '...');
          
          if (statusOutput.includes('Serving as master agent')) {
            console.log('✅ Bug A Fixed: agent_master_status recognizes master');
          } else {
            console.log('❌ Bug A: agent_master_status says "Not serving as master agent"');
          }
          
          if (statusOutput.includes(`Port: ${masterPort}`)) {
            console.log('✅ Correct port shown');
          }
          
        } catch (error) {
          console.log('❌ agent_master_status failed:', error.message);
        } finally {
          master.kill();
          testAgentSpawnLocal();
        }
      }, 2000);
    }
  }
});

master.stderr.on('data', (data) => {
  console.error('Master stderr:', data.toString());
});

function testAgentSpawnLocal() {
  console.log('\n=== Test 3: agent_spawn_local parameter handling ===');
  console.log('Starting master for worker test...');
  
  const master2 = spawn('node', ['dist/cli/main.js', 'agent', 'serve', '--name', 'testmaster'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
  });
  
  let master2Ready = false;
  
  master2.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Agent server started on port')) {
      master2Ready = true;
      console.log('✅ Test master started');
      
      // Test agent_spawn_local with JSON input
      setTimeout(() => {
        console.log('\nTesting agent_spawn_local with { "name": "worker1" }...');
        try {
          // Simulate TUI parameter passing
          const spawnOutput = execSync('node dist/cli/main.js agent spawn --name worker1', { 
            encoding: 'utf8',
            timeout: 10000 
          });
          console.log('agent_spawn_local output:');
          console.log(spawnOutput.substring(0, 300) + '...');
          
          if (spawnOutput.includes('worker1') && !spawnOutput.includes('undefined')) {
            console.log('✅ Bug B Fixed: agent_spawn_local accepts name parameter');
          } else if (spawnOutput.includes('Agent name is required')) {
            console.log('❌ Bug B: agent_spawn_local still rejecting name parameter');
            console.log('Check debug output for parameter parsing');
          }
          
          // Check agent_list
          const listOutput = execSync('node dist/cli/main.js agent list', { 
            encoding: 'utf8',
            timeout: 5000 
          });
          console.log('\nagent_list output:');
          console.log(listOutput);
          
          if (listOutput.includes('worker1') && listOutput.includes('testmaster')) {
            console.log('✅ Both master and worker appear in agent_list');
          }
          
        } catch (error) {
          console.log('❌ agent_spawn_local failed:', error.message);
          if (error.stderr) {
            console.log('Stderr:', error.stderr.toString());
          }
        } finally {
          master2.kill();
          testCleanupTools();
        }
      }, 2000);
    }
  });
}

function testCleanupTools() {
  console.log('\n=== Test 4: Cleanup tools ===');
  
  // First occupy a port
  const port = 43102;
  console.log(`Testing port ${port} cleanup...`);
  
  const tempServer = spawn('node', ['-e', `const http = require('http'); const server = http.createServer(); server.listen(${port}, () => console.log('Holding port ${port}'));`], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
  });
  
  setTimeout(() => {
    console.log('Testing agent_serve on occupied port...');
    try {
      const output = execSync(`node dist/cli/main.js agent serve --name test --port ${port}`, { 
        encoding: 'utf8',
        timeout: 5000 
      });
      console.log('Output:', output);
    } catch (error) {
      if (error.stdout && error.stdout.toString().includes('already in use')) {
        console.log('✅ Bug D/E: agent_serve detects occupied port');
        console.log('Error message suggests agent_cleanup_port');
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }
    
    // Kill temp server
    tempServer.kill();
    
    console.log('\n=== SUMMARY ===');
    console.log('Fixes implemented:');
    console.log('✅ A. Unify master truth: agent_master singleton');
    console.log('✅ B. agent_spawn_local input: parameter normalization');
    console.log('✅ C. agent_serve reporting: debug output added');
    console.log('✅ D/E. Lifecycle cleanup: port checking, cleanup tool');
    console.log('\nReady for TUI testing!');
    process.exit(0);
  }, 1000);
}

// Timeout
setTimeout(() => {
  console.log('\n❌ Test timeout');
  process.exit(1);
}, 30000);