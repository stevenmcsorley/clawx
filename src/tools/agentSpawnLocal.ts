/**
 * Agent Spawn Local Tool
 * 
 * Spawn a local headless agent.
 */

import { ToolDefinition } from '../types/extension.js';
import { log } from '../utils/logger.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { 
  isDuplicateName, 
  findAvailablePort, 
  cleanupStaleAgents,
  checkAgentHealth,
  getUniqueAgentName 
} from '../utils/agent-utils.js';
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

export const agentSpawnLocalTool: ToolDefinition = {
  name: 'agent_spawn_local',
  label: 'Spawn Local Agent',
  description: 'Spawn a local headless agent',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Agent name (required)',
      },
      allowed_tools: {
        type: 'array',
        description: 'Tools this agent can execute (empty = all)',
        items: { type: 'string' },
        default: [],
      },
      port: {
        type: 'number',
        description: 'Port for agent server (0 = auto)',
        default: 0,
      },
      master_endpoint: {
        type: 'string',
        description: 'Master endpoint for registration (default: auto-detect)',
        default: '',
      },
    },
    required: ['name'],
  },
  
  async execute(params: any, context: any) {
    const name = params.name;
    const allowedTools = params.allowed_tools || [];
    const requestedPort = params.port || 0;
    
    try {
      // Clean up stale agents first
      const cleaned = cleanupStaleAgents();
      if (cleaned > 0) {
        log.info(`Cleaned up ${cleaned} stale agents`);
      }
      
      const registry = new AgentRegistryManager();
      
      // Get unique name
      const finalName = getUniqueAgentName(name);
      if (finalName !== name) {
        log.warn(`Agent name "${name}" already exists, using "${finalName}" instead`);
      }
      
      const agentId = uuidv4();
      const workspace = registry.ensureAgentWorkspace(agentId);
      
      // Determine master endpoint
      let masterEndpoint = params.master_endpoint;
      if (!masterEndpoint && context._agentConfig) {
        // Use current instance as master
        masterEndpoint = `http://localhost:${context._agentConfig.port}`;
      } else if (!masterEndpoint) {
        // Default fallback
        masterEndpoint = 'http://localhost:3000';
      }
      
      // Find available port
      let actualPort = requestedPort;
      if (requestedPort === 0) {
        actualPort = await findAvailablePort(30000, 100);
        log.debug(`Found available port: ${actualPort}`);
      }
      
      // Create agent config
      const config = {
        id: agentId,
        name: finalName,
        port: actualPort,
        workspace,
        masterEndpoint,
        allowedTools,
      };
      
      const configPath = join(workspace, 'agent-config.json');
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      
      log.info(`Spawning local agent: ${finalName} (${agentId}) on port ${actualPort}`);
      log.info(`Workspace: ${workspace}`);
      log.info(`Master: ${masterEndpoint}`);
      
      // Build command to start agent
      const nodePath = process.argv[0];
      const scriptPath = process.argv[1];
      const args = [
        'agent', 'serve',
        '--id', agentId,
        '--name', finalName,
        '--port', actualPort.toString(),
        '--master', masterEndpoint,
        '--workspace', workspace,
      ];
      
      if (allowedTools.length > 0) {
        args.push('--allowed-tools', allowedTools.join(','));
      }
      
      log.info(`Spawning agent process...`);
      
      // Actually spawn the agent process
      const agentProcess = spawn(nodePath, [scriptPath, ...args], {
        cwd: workspace,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });
      
      // Store process info
      const processInfo = {
        pid: agentProcess.pid,
        stdout: '',
        stderr: '',
      };
      
      // Capture output
      agentProcess.stdout?.on('data', (data) => {
        processInfo.stdout += data.toString();
        log.debug(`Agent ${finalName} stdout: ${data.toString().trim()}`);
      });
      
      agentProcess.stderr?.on('data', (data) => {
        processInfo.stderr += data.toString();
        log.debug(`Agent ${finalName} stderr: ${data.toString().trim()}`);
      });
      
      // Handle process exit
      agentProcess.on('exit', (code, signal) => {
        log.info(`Agent ${finalName} exited - code: ${code}, signal: ${signal}`);
        // Mark as offline in registry
        const registry = new AgentRegistryManager();
        const agent = registry.getAgent(agentId);
        if (agent) {
          agent.status = 'offline';
          agent.lastHeartbeat = Date.now();
          registry.upsertAgent(agent);
          registry.save();
          log.info(`Marked agent ${finalName} as offline`);
        }
      });
      
      // Register agent as starting
      const agent = {
        id: agentId,
        name: finalName,
        type: 'local' as const,
        status: 'starting' as const,
        capabilities: allowedTools.length > 0 ? allowedTools : ['all'],
        endpoint: `http://localhost:${actualPort}`,
        workspace,
        created: Date.now(),
        lastHeartbeat: Date.now(),
        processId: agentProcess.pid,
      };
      
      registry.upsertAgent(agent);
      registry.save();
      
      // Wait for agent to start and verify health
      log.info(`Waiting for agent ${finalName} to start...`);
      let isHealthy = false;
      const maxWaitTime = 10000; // 10 seconds
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        try {
          isHealthy = await checkAgentHealth(`http://localhost:${actualPort}`, 2000);
          if (isHealthy) {
            break;
          }
        } catch (error) {
          // Agent not ready yet
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      if (!isHealthy) {
        // Agent failed to start
        agentProcess.kill('SIGTERM');
        registry.removeAgent(agentId);
        registry.save();
        
        throw new Error(`Agent failed to start within ${maxWaitTime}ms. Check logs for errors.`);
      }
      
      // Update agent status to idle
      const updatedAgent = {
        ...agent,
        status: 'idle' as const,
        lastHeartbeat: Date.now(),
      };
      registry.upsertAgent(updatedAgent);
      registry.save();
      
      log.info(`Agent ${finalName} started successfully on http://localhost:${actualPort}`);
      
      const output = `✅ Agent "${finalName}" spawned (ID: ${agentId})\n\n` +
                    `**Details:**\n` +
                    `- ID: ${agentId}\n` +
                    `- Name: ${finalName}${finalName !== name ? ` (requested: "${name}")` : ''}\n` +
                    `- Type: local\n` +
                    `- Status: idle\n` +
                    `- PID: ${agentProcess.pid}\n` +
                    `- Endpoint: http://localhost:${actualPort}\n` +
                    `- Workspace: ${workspace}\n` +
                    `- Master endpoint: ${masterEndpoint}\n` +
                    `- Allowed tools: ${allowedTools.length > 0 ? allowedTools.join(', ') : 'all'}\n\n` +
                    `Agent process started and ready to receive tasks.\n` +
                    `Use \`agent_send\` to send tasks to this agent.`;
      
      return {
        content: [{ type: 'text', text: output }],
        details: {
          agent_id: agentId,
          agent_name: finalName,
          workspace,
          master_endpoint: masterEndpoint,
          allowed_tools: allowedTools,
          config_path: configPath,
          command: `${nodePath} ${scriptPath} ${args.join(' ')}`,
          spawned: true,
        },
      };
      
    } catch (error) {
      log.error('Failed to spawn agent:', error);
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to spawn agent: ${error instanceof Error ? error.message : String(error)}`,
        }],
        details: { error: error instanceof Error ? error.message : String(error) },
        isError: true,
      };
    }
  },
};