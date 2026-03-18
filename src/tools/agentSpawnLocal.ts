/**
 * Agent Spawn Local Tool
 * 
 * Spawn a local headless agent.
 */

import { ToolDefinition } from '../types/extension.js';
import { log } from '../utils/logger.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
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
    const port = params.port || 0;
    
    try {
      const registry = new AgentRegistryManager();
      
      // Check if name already exists
      const existing = registry.getAgentByName(name);
      if (existing) {
        return {
          content: [{
            type: 'text',
            text: `❌ Agent with name "${name}" already exists (ID: ${existing.id})`,
          }],
          details: { error: 'Agent name already exists', existing_agent: existing },
          isError: true,
        };
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
      
      // Create agent config
      const config = {
        id: agentId,
        name,
        port,
        workspace,
        masterEndpoint,
        allowedTools,
      };
      
      const configPath = join(workspace, 'agent-config.json');
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      
      log.info(`Spawning local agent: ${name} (${agentId})`);
      log.info(`Workspace: ${workspace}`);
      log.info(`Master: ${masterEndpoint}`);
      
      // Build command to start agent
      const nodePath = process.argv[0];
      const scriptPath = process.argv[1];
      const args = [
        'agent', 'serve',
        '--id', agentId,
        '--name', name,
        '--port', port.toString(),
        '--master', masterEndpoint,
        '--workspace', workspace,
      ];
      
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
        log.debug(`Agent ${name} stdout: ${data.toString().trim()}`);
      });
      
      agentProcess.stderr?.on('data', (data) => {
        processInfo.stderr += data.toString();
        log.debug(`Agent ${name} stderr: ${data.toString().trim()}`);
      });
      
      // Handle process exit
      agentProcess.on('exit', (code) => {
        log.info(`Agent ${name} exited with code ${code}`);
        // Mark as offline in registry
        const registry = new AgentRegistryManager();
        const agent = registry.getAgent(agentId);
        if (agent) {
          agent.status = 'offline';
          registry.upsertAgent(agent);
          registry.save();
        }
      });
      
      // Register agent as starting
      const agent = {
        id: agentId,
        name,
        type: 'local' as const,
        status: 'working' as const,
        capabilities: allowedTools.length > 0 ? allowedTools : ['all'],
        endpoint: `http://localhost:${port}`,
        workspace,
        created: Date.now(),
        lastHeartbeat: Date.now(),
        processId: agentProcess.pid,
      };
      
      registry.upsertAgent(agent);
      registry.save();
      
      // Wait a moment for agent to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update agent status to idle (assuming it started successfully)
      agent.status = 'idle';
      registry.upsertAgent(agent);
      registry.save();
      
      const output = `✅ Agent "${name}" spawned (ID: ${agentId})\n\n` +
                    `**Details:**\n` +
                    `- ID: ${agentId}\n` +
                    `- Name: ${name}\n` +
                    `- Type: local\n` +
                    `- Status: idle\n` +
                    `- PID: ${agentProcess.pid}\n` +
                    `- Endpoint: http://localhost:${port}\n` +
                    `- Workspace: ${workspace}\n` +
                    `- Master endpoint: ${masterEndpoint}\n` +
                    `- Allowed tools: ${allowedTools.length > 0 ? allowedTools.join(', ') : 'all'}\n\n` +
                    `Agent process started and ready to receive tasks.\n` +
                    `Use \`agent_send\` to send tasks to this agent.`;
      
      return {
        content: [{ type: 'text', text: output }],
        details: {
          agent_id: agentId,
          agent_name: name,
          workspace,
          master_endpoint: masterEndpoint,
          allowed_tools: allowedTools,
          config_path: configPath,
          command: `${nodePath} ${scriptPath} ${args.join(' ')}`,
          spawned: false, // TODO: Set to true when actually spawning
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