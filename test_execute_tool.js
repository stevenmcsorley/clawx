// Test executing a tool on the agent
import fetch from 'node-fetch';
import { setLogLevel } from './dist/utils/logger.js';

// Enable debug logging
setLogLevel('debug');

const agentPort = 44201;

async function test() {
  console.log('Testing tool execution on agent...');
  
  // Try to execute agent_ws_chat tool
  try {
    const executeRes = await fetch(`http://localhost:${agentPort}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: 'test-execute-123',
        tool: 'agent_ws_chat',
        params: { action: 'list' },
      }),
    });
    
    const executeText = await executeRes.text();
    console.log('Execute response:', executeText);
  } catch (error) {
    console.log('Execute error:', error.message);
  }
}

test().catch(console.error);