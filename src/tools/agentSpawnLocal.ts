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
import { existsSync, mkdirSync, writeFileSync, rmSync, statSync } from 'fs';

const SPAWN_LOCK_DIR = join(homedir(), '.clawx', 'agents', 'spawn.lock');

async function acquireSpawnLock(timeoutMs = 10000, staleMs = 30000): Promise<() => void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      mkdirSync(SPAWN_LOCK_DIR);
      return () => {
        try {
          rmSync(SPAWN_LOCK_DIR, { recursive: true, force: true });
        } catch {
          // best effort
        }
      };
    } catch (error: any) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }

      try {
        const stats = statSync(SPAWN_LOCK_DIR);
        if (Date.now() - stats.mtimeMs > staleMs) {
          rmSync(SPAWN_LOCK_DIR, { recursive: true, force: true });
          continue;
        }
      } catch {
        // another process may have released it
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  throw new Error('Timed out waiting for agent spawn lock');
}

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
  
  async execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any, context?: any) {
    log.debug('agent_spawn_local toolCallId:', toolCallId);
    log.debug('agent_spawn_local raw params:', params);
    
    // Handle case where params might be toolCallId (legacy issue)
    let actualParams = params;
    if (typeof params === 'string' && params.startsWith('call_')) {
      log.warn('Received toolCallId as params, using empty params');
      actualParams = {};
    }
    
    // Normalize parameter names (handle both snake_case and camelCase)
    const normalizedParams = {
      name: actualParams.name || actualParams.agent_name,
      allowed_tools: actualParams.allowed_tools || actualParams.allowedTools || [],
      port: actualParams.port || 0,
      master_endpoint: actualParams.master_endpoint || actualParams.masterEndpoint || '',
    };
    
    log.debug('agent_spawn_local normalized params:', normalizedParams);
    
    const name = normalizedParams.name;
    if (!name || typeof name !== 'string') {
      log.debug('name validation failed:', { 
        toolCallId,
        rawParams: actualParams, 
        normalizedParams,
        name, 
        type: typeof name 
      });
      return {
        content: [{
          type: 'text',
          text: '❌ Agent name is required and must be a string\n' +
                `ToolCallId: ${toolCallId}\n` +
                `Received params: ${JSON.stringify(actualParams)}\n` +
                `Normalized: ${JSON.stringify(normalizedParams)}`,
        }],
        details: { error: 'Name required', toolCallId, rawParams: actualParams, normalizedParams },
        isError: true,
      };
    }
    
    const allowedTools = normalizedParams.allowed_tools;
    const requestedPort = normalizedParams.port;
    
    let releaseSpawnLock: (() => void) | null = null;

    try {
      releaseSpawnLock = await acquireSpawnLock();

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
      let masterEndpoint = normalizedParams.master_endpoint || context?.masterEndpoint || context?.master_endpoint;
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
      
      // Agents support all tools that the agent server can execute
      // This includes coding tools (read, write, edit, bash), grep, find, ls, search_files, git_status, git_diff, ssh_run
      // PLUS agent communication tools for real-time collaboration
      const agentSupportedTools = [
        'read', 'write', 'edit', 'bash', 
        'grep', 'find', 'ls', 'search_files', 
        'git_status', 'git_diff', 'ssh_run',
        'agent_chat_direct', 'agent_grpc_chat'
      ];
      const effectiveAllowedTools = allowedTools.length > 0 
        ? allowedTools.filter((tool: string) => agentSupportedTools.includes(tool))
        : agentSupportedTools;
      
      if (allowedTools.length > 0 && effectiveAllowedTools.length !== allowedTools.length) {
        const unsupported = allowedTools.filter((tool: string) => !agentSupportedTools.includes(tool));
        log.warn(`Agent cannot support tools: ${unsupported.join(', ')}. Only supporting: ${agentSupportedTools.join(', ')}`);
      }
      
      // Create agent config
      const masterWorkspace = agentMaster.getConfig()?.workspace || process.cwd();
      const ownerMasterConfig = agentMaster.getConfig();
      const config = {
        id: agentId,
        name: finalName,
        port: actualPort,
        workspace,
        masterEndpoint,
        allowedTools: effectiveAllowedTools,
        masterWorkspace,
        ownerMasterId: ownerMasterConfig?.id,
        ownerMasterName: ownerMasterConfig?.name,
        ownerMasterEndpoint: masterEndpoint,
        autoStart: true,
      };
      
      const configPath = join(workspace, 'agent-config.json');
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      
      log.info(`Spawning local agent: ${finalName} (${agentId}) on port ${actualPort}`);
      log.info(`Workspace: ${workspace}`);
      log.info(`Master: ${masterEndpoint}`);
      
      // Verify master is reachable before spawning agent
      try {
        log.info(`Verifying master endpoint: ${masterEndpoint}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const masterHealth = await fetch(`${masterEndpoint}/health`, { 
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!masterHealth.ok) {
          throw new Error(`Master health check failed with status: ${masterHealth.status}`);
        }
        log.info(`Master is reachable and healthy`);
      } catch (error) {
        log.warn(`Master health check failed: ${error instanceof Error ? error.message : String(error)}`);
        log.warn(`Agent may fail to register with master`);
      }
      
      // Build command to start agent
      // Try to use the global 'clawx' command if available
      // Build args first
      let args = [
        'agent', 'serve',
        '--id', agentId,
        '--name', finalName,
        '--port', actualPort.toString(),
        '--master', masterEndpoint,
        '--workspace', workspace,
        '--verbose',
      ];

      if (masterWorkspace) {
        args.push('--master-workspace', masterWorkspace);
      }
      
      // Determine the best way to spawn the agent
      // Priority 1: Use 'clawx' command if available (for global installs)
      // Priority 2: Use node + the current script path (for development)
      // Priority 3: Use node and try to find the CLI entry point
      
      let nodePath = process.argv[0];
      let scriptPath = process.argv[1];
      let useClawxCommand = false;
      let globalClawxScriptPath = '';
      
      // Check if 'clawx' command is available in PATH (cross-platform)
      try {
        const { execSync } = await import('child_process');
        // Try different commands to find clawx
        let clawxFound = false;
        try {
          if (process.platform === 'win32') {
            execSync('where clawx', { stdio: 'ignore' });
          } else {
            execSync('which clawx', { stdio: 'ignore' });
          }
          clawxFound = true;
        } catch (error) {
          // Also try command -v for Unix-like systems
          if (process.platform !== 'win32') {
            try {
              execSync('command -v clawx', { stdio: 'ignore' });
              clawxFound = true;
            } catch (error2) {
              // Not found
            }
          }
        }
        
        if (clawxFound) {
          // 'clawx' command is available - prefer resolving its real JS entry point,
          // especially on Windows where wrapper scripts can create console windows or spawn issues.
          if (process.platform === 'win32') {
            try {
              const { execSync } = await import('child_process');
              const globalNodeModules = execSync('npm root -g', { encoding: 'utf8' }).trim();
              const candidatePath = join(globalNodeModules, '@halfagiraf', 'clawx', 'bin', 'clawx.js');
              if (existsSync(candidatePath)) {
                nodePath = process.execPath;
                scriptPath = candidatePath;
                globalClawxScriptPath = candidatePath;
                useClawxCommand = false;
                log.debug(`Using resolved global clawx script: ${candidatePath}`);
              } else {
                nodePath = 'clawx';
                scriptPath = '';
                useClawxCommand = true;
                log.debug(`Global clawx script not found at ${candidatePath}, falling back to command wrapper`);
              }
            } catch (resolveError) {
              nodePath = 'clawx';
              scriptPath = '';
              useClawxCommand = true;
              log.debug(`Failed resolving global clawx script, falling back to command wrapper: ${resolveError}`);
            }
          } else {
            nodePath = 'clawx';
            scriptPath = ''; // No script path needed when using 'clawx' command
            useClawxCommand = true;
            log.debug(`Using global '${nodePath}' command with full subcommand args`);
          }
        } else {
          log.debug(`'clawx' command not found in PATH`);
        }
      } catch (error) {
        log.debug(`Error checking for 'clawx' command: ${error}`);
      }
      
      // If not using clawx command, check if we have a valid script path
      if (!useClawxCommand) {
        // Check if scriptPath looks like a CLI entry point
        // CLI entry points are usually: bin/clawx.js, dist/cli/main.js, or similar
        const isCliEntryPoint = scriptPath && (
          scriptPath.includes('clawx.js') ||
          scriptPath.includes('cli/main.js') ||
          scriptPath.includes('cli/main.cjs') ||
          scriptPath.endsWith('.js') || scriptPath.endsWith('.cjs')
        );
        
        if (!isCliEntryPoint) {
          // scriptPath doesn't look like a CLI entry point
          // Try to find the CLI entry point relative to current file
          log.warn(`Script path doesn't look like CLI entry point: ${scriptPath}`);
          log.warn(`Agent spawning may fail. For best results:`);
          log.warn(`1. Install globally: npm install -g @halfagiraf/clawx`);
          log.warn(`2. Or ensure you're running via: node bin/clawx.js or npm start`);
        }
      }
      
      log.debug(`Spawning agent with: ${nodePath} ${scriptPath ? scriptPath + ' ' : ''}${args.join(' ')}`);
      log.debug(`Using clawx command: ${useClawxCommand}`);
      if (globalClawxScriptPath) {
        log.debug(`Resolved global clawx script path: ${globalClawxScriptPath}`);
      }
      log.debug(`Current directory: ${process.cwd()}`);
      log.debug(`Platform: ${process.platform}`);
      
      // Add gRPC endpoint if master has one
      if (masterEndpoint) {
        try {
          const masterHealth = await fetch(`${masterEndpoint}/health`);
          if (masterHealth.ok) {
            const masterInfo = await masterHealth.json() as any;
            if (masterInfo.grpcPort) {
              args.push('--grpc-master', `grpc://localhost:${masterInfo.grpcPort}`);
            }
          }
        } catch (error) {
          log.debug('Could not get master gRPC endpoint:', error);
        }
      }
      
      if (allowedTools.length > 0) {
        args.push('--allowed-tools', allowedTools.join(','));
      }
      
      log.info(`Spawning agent process...`);
      const workerLogPath = join(workspace, 'worker.log');
      
      // Actually spawn the agent process
      let agentProcess;
      
      if (process.platform === 'win32') {
        const spawnArgs = scriptPath ? [scriptPath, ...args] : args;

        if (useClawxCommand) {
          log.debug(`Windows wrapper spawn: ${nodePath} ${spawnArgs.join(' ')}`);
          agentProcess = spawn(nodePath, spawnArgs, {
            cwd: workspace,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true,
            windowsHide: true,
            detached: true,
          });
        } else {
          log.debug(`Windows direct node spawn: ${nodePath} ${spawnArgs.join(' ')}`);
          agentProcess = spawn(nodePath, spawnArgs, {
            cwd: workspace,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: false,
            windowsHide: true,
            detached: true,
          });
        }
      } else {
        // On Unix-like systems
        const spawnArgs = scriptPath ? [scriptPath, ...args] : args;
        log.debug(`Unix spawn: ${nodePath} ${spawnArgs.join(' ')}`);
        agentProcess = spawn(nodePath, spawnArgs, {
          cwd: workspace,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true,
        });
      }

      try {
        agentProcess.unref();
      } catch {
        // Best effort only
      }
      
      // Store process info
      const processInfo = {
        pid: agentProcess.pid,
        stdout: '',
        stderr: '',
      };
      
      // Capture output
      agentProcess.stdout?.on('data', (data) => {
        const text = data.toString();
        processInfo.stdout += text;
        try {
          writeFileSync(workerLogPath, processInfo.stdout + (processInfo.stderr ? `\n[stderr]\n${processInfo.stderr}` : ''), 'utf8');
        } catch {}
        log.debug(`Agent ${finalName} stdout: ${text.trim()}`);
      });
      
      agentProcess.stderr?.on('data', (data) => {
        const text = data.toString();
        processInfo.stderr += text;
        try {
          writeFileSync(workerLogPath, processInfo.stdout + (processInfo.stderr ? `\n[stderr]\n${processInfo.stderr}` : ''), 'utf8');
        } catch {}
        log.debug(`Agent ${finalName} stderr: ${text.trim()}`);
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
        ownerMasterId: ownerMasterConfig?.id,
        ownerMasterName: ownerMasterConfig?.name,
        ownerMasterEndpoint: masterEndpoint,
        autoStart: true,
      };
      
      registry.upsertAgent(agent);
      registry.save();
      
      // Wait for agent to start and verify health
      log.info(`Waiting for agent ${finalName} to start...`);
      let isHealthy = false;
      const maxWaitTime = 15000; // 15 seconds
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        try {
          isHealthy = await checkAgentHealth(`http://localhost:${actualPort}`, 2000);
          if (isHealthy) {
            const healthResponse = await fetch(`http://localhost:${actualPort}/health`);
            if (healthResponse.ok) {
              const healthJson = await healthResponse.json() as any;
              if (healthJson?.agentId === agentId) {
                log.info(`Health check passed for agent ${finalName} on port ${actualPort}`);
                break;
              }
              log.warn(`Port ${actualPort} is healthy but belongs to different agent ${healthJson?.agentId || 'unknown'} while waiting for ${agentId}`);
              isHealthy = false;
            } else {
              isHealthy = false;
            }
          }
        } catch (error) {
          // Agent not ready yet, log first few attempts
          const attempt = Math.floor((Date.now() - startTime) / 500) + 1;
          if (attempt <= 3) {
            log.debug(`Health check attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        if (agentProcess.exitCode !== null) {
          log.warn(`Agent process for ${finalName} exited early with code ${agentProcess.exitCode}`);
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      if (!isHealthy) {
        // Agent failed to start - check if process is still running
        let processExited = false;
        try {
          // Check if process is still alive (non-zero exit means process ended)
          processExited = agentProcess.exitCode !== null;
        } catch (error) {
          processExited = true;
        }
        
        log.error(`Agent ${finalName} failed health checks. Process exited: ${processExited}`);
        log.error(`Process stdout (last 1000 chars): ${processInfo.stdout.slice(-1000)}`);
        log.error(`Process stderr (last 1000 chars): ${processInfo.stderr.slice(-1000)}`);
        
        // Try to kill process if still running
        if (!processExited) {
          try {
            agentProcess.kill('SIGTERM');
          } catch (error) {
            log.debug('Error killing process:', error);
          }
        }
        
        registry.removeAgent(agentId);
        registry.save();
        
        throw new Error(`Agent failed to start within ${maxWaitTime}ms. Process ${processExited ? 'exited' : 'still running'}. Check logs for details.`);
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
    } finally {
      try {
        releaseSpawnLock?.();
      } catch {
        // best effort
      }
    }
  },
};