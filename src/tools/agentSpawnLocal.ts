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
import { agentMaster } from '../core/agent-master.js';
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
    log.debug('agent_spawn_local raw params:', params);
    
    // Normalize parameter names (handle both snake_case and camelCase)
    const normalizedParams = {
      name: params.name || params.agent_name,
      allowed_tools: params.allowed_tools || params.allowedTools || [],
      port: params.port || 0,
      master_endpoint: params.master_endpoint || params.masterEndpoint || '',
    };
    
    log.debug('agent_spawn_local normalized params:', normalizedParams);
    
    const name = normalizedParams.name;
    if (!name || typeof name !== 'string') {
      log.debug('name validation failed:', { 
        rawParams: params, 
        normalizedParams,
        name, 
        type: typeof name 
      });
      return {
        content: [{
          type: 'text',
          text: '❌ Agent name is required and must be a string\n' +
                `Received: ${JSON.stringify(params)}\n` +
                `Normalized: ${JSON.stringify(normalizedParams)}`,
        }],
        details: { error: 'Name required', rawParams: params, normalizedParams },
        isError: true,
      };
    }
    
    const allowedTools = normalizedParams.allowed_tools;
    const requestedPort = normalizedParams.port;
    
    try {
      // Clean up stale agents first
      const cleaned = cleanupStaleAgents();
      if (cleaned > 0) {
        log.info(`Cleaned up ${cleaned} stale agents`);
      }
      
      const registry = new AgentRegistryManager();
      
      // Get unique name (only if needed)
      const finalName = getUniqueAgentName(name);
      if (finalName !== name) {
        log.warn(`Agent name "${name}" already exists, using "${finalName}" instead`);
      }
      
      const agentId = uuidv4();
      const workspace = registry.ensureAgentWorkspace(agentId);
      
      // Determine master endpoint - require explicit master or current instance
      let masterEndpoint = normalizedParams.master_endpoint;
      if (!masterEndpoint && agentMaster.isServing()) {
        // Use current instance as master
        const config = agentMaster.getConfig();
        masterEndpoint = `http://localhost:${config?.port}`;
        log.info(`Using current instance as master: ${masterEndpoint}`);
      } else if (!masterEndpoint) {
        // No master available - fail clearly
        return {
          content: [{
            type: 'text',
            text: '❌ No master endpoint available. Either:\n' +
                  '1. Start a master first with agent_serve\n' +
                  '2. Provide --master_endpoint parameter\n' +
                  '3. Use agent_spawn_local from a master session',
          }],
          details: { error: 'No master endpoint' },
          isError: true,
        };
      }
      
      // Verify master is reachable
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const healthResponse = await fetch(`${masterEndpoint}/health`, { 
          signal: controller.signal 
        });
        clearTimeout(timeoutId);
        if (!healthResponse.ok) {
          return {
            content: [{
              type: 'text',
              text: `❌ Master endpoint ${masterEndpoint} is not reachable or healthy.\n` +
                    'Start a master with agent_serve first.',
            }],
            details: { error: 'Master unreachable', endpoint: masterEndpoint },
            isError: true,
          };
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `❌ Cannot connect to master endpoint ${masterEndpoint}\n` +
                  `Error: ${error instanceof Error ? error.message : String(error)}\n` +
                  'Start a master with agent_serve first.',
          }],
          details: { error: 'Master connection failed', endpoint: masterEndpoint },
          isError: true,
        };
      }
      
      // Find available port
      let actualPort = requestedPort;
      if (requestedPort === 0) {
        // Auto-select from worker range
        const { findAvailablePortInRange } = await import('../utils/agent-utils.js');
        actualPort = await findAvailablePortInRange('worker');
        log.debug(`Auto-selected worker port: ${actualPort}`);
      }
      
      // Agents only support basic tools for now
      const agentSupportedTools = ['search_files', 'git_status', 'git_diff', 'ssh_run'];
      const effectiveAllowedTools = allowedTools.length > 0 
        ? allowedTools.filter((tool: string) => agentSupportedTools.includes(tool))
        : agentSupportedTools;
      
      if (allowedTools.length > 0 && effectiveAllowedTools.length !== allowedTools.length) {
        const unsupported = allowedTools.filter((tool: string) => !agentSupportedTools.includes(tool));
        log.warn(`Agent cannot support tools: ${unsupported.join(', ')}. Only supporting: ${agentSupportedTools.join(', ')}`);
      }
      
      // Create agent config
      const config = {
        id: agentId,
        name: finalName,
        port: actualPort,
        workspace,
        masterEndpoint,
        allowedTools: effectiveAllowedTools,
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