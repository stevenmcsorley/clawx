/**
 * CLI Agent Commands
 * 
 * Commands for managing Clawx agents.
 * 
 * Usage:
 *   clawx agent serve [options]    # Start as headless agent
 *   clawx agent list               # List registered agents (master only)
 *   clawx agent spawn [options]    # Spawn new agent (master only)
 */

import { Command } from 'commander';
import { log } from '../utils/logger.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { startAgentServer } from '../core/agent-server.js';
import { v4 as uuidv4 } from 'uuid';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

export function createAgentCommand(): Command {
  const agentCmd = new Command('agent')
    .description('Manage Clawx agents')
    .configureHelp({ helpWidth: 80 });

  // agent serve - Start as headless agent
  agentCmd
    .command('serve')
    .description('Start as a headless agent')
    .option('--id <id>', 'Agent ID (default: auto-generated)')
    .option('--name <name>', 'Agent name (default: "agent-<id>")')
    .option('--port <port>', 'Port to listen on (default: 0 = auto)', '0')
    .option('--master <url>', 'Master endpoint for registration')
    .option('--workspace <path>', 'Workspace directory')
    .action(async (options) => {
      try {
        await serveAgent(options);
      } catch (error) {
        log.error('Failed to start agent:', error);
        process.exit(1);
      }
    });

  // agent list - List registered agents
  agentCmd
    .command('list')
    .description('List registered agents')
    .action(() => {
      try {
        listAgents();
      } catch (error) {
        log.error('Failed to list agents:', error);
        process.exit(1);
      }
    });

  // agent spawn - Spawn new agent
  agentCmd
    .command('spawn')
    .description('Spawn a new agent')
    .option('--name <name>', 'Agent name (required)', '')
    .option('--local', 'Spawn locally (default)')
    .option('--remote <host>', 'Spawn on remote host via SSH')
    .action(async (options) => {
      try {
        await spawnAgent(options);
      } catch (error) {
        log.error('Failed to spawn agent:', error);
        process.exit(1);
      }
    });

  return agentCmd;
}

/** Start as headless agent */
async function serveAgent(options: any): Promise<void> {
  const agentId = options.id || uuidv4();
  const agentName = options.name || `agent-${agentId.substring(0, 8)}`;
  const port = parseInt(options.port, 10) || 0;
  
  // Default workspace
  const workspace = options.workspace || join(homedir(), '.clawx', 'agents', agentId);
  if (!existsSync(workspace)) {
    mkdirSync(workspace, { recursive: true });
  }

  log.info(`Starting agent: ${agentName} (${agentId})`);
  log.info(`Workspace: ${workspace}`);
  log.info(`Port: ${port === 0 ? 'auto' : port}`);

  // Write agent config
  const config = {
    id: agentId,
    name: agentName,
    port,
    workspace,
    masterEndpoint: options.master || 'http://localhost:3000',
    allowedTools: [], // Empty = all tools
  };

  const configPath = join(workspace, 'agent-config.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  log.debug(`Config written: ${configPath}`);

  // Start agent server
  const server = await startAgentServer(config);
  
  log.info(`Agent server started on port ${server.port}`);
  
  // Auto-register with master if master endpoint provided
  if (options.master && options.master !== 'http://localhost:3000') {
    try {
      const response = await fetch(`${options.master}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agentId,
          agentName: agentName,
          endpoint: `http://localhost:${server.port}`,
          capabilities: config.allowedTools,
        }),
      });
      
      if (response.ok) {
        log.info(`Registered with master: ${options.master}`);
      } else {
        log.warn(`Failed to register with master: ${response.status}`);
      }
    } catch (error) {
      log.warn(`Could not register with master: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  log.info('Press Ctrl+C to stop');

  // Handle shutdown
  process.on('SIGINT', () => {
    log.info('Shutting down agent...');
    server.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log.info('Terminating agent...');
    server.close();
    process.exit(0);
  });
}

/** List registered agents */
function listAgents(): void {
  const registry = new AgentRegistryManager();
  const agents = registry.getAgents();
  
  console.log('\nRegistered Agents:');
  console.log('==================\n');
  
  if (agents.length === 0) {
    console.log('No agents registered.');
    return;
  }
  
  for (const agent of agents) {
    console.log(`ID:      ${agent.id}`);
    console.log(`Name:    ${agent.name}`);
    console.log(`Type:    ${agent.type}`);
    console.log(`Status:  ${agent.status}`);
    console.log(`Endpoint: ${agent.endpoint || 'N/A'}`);
    console.log(`Workspace: ${agent.workspace}`);
    console.log(`Created: ${new Date(agent.created).toLocaleString()}`);
    
    if (agent.lastHeartbeat) {
      const age = Date.now() - agent.lastHeartbeat;
      console.log(`Last heartbeat: ${Math.floor(age / 1000)}s ago`);
    }
    
    console.log(`Capabilities: ${agent.capabilities.length > 0 ? agent.capabilities.join(', ') : 'all'}`);
    console.log('---');
  }
  
  console.log(`Total: ${agents.length} agent(s)`);
}

/** Spawn new agent */
async function spawnAgent(options: any): Promise<void> {
  if (!options.name) {
    log.error('Agent name is required (--name <name>)');
    process.exit(1);
  }
  
  if (options.remote) {
    log.info(`TODO: Remote spawn to ${options.remote}`);
    log.info('Remote spawn not implemented in v1');
    // TODO: Implement SSH deployment
  } else {
    // Local spawn
    await spawnLocalAgent(options.name);
  }
}

/** Spawn local agent */
async function spawnLocalAgent(name: string): Promise<void> {
  const agentId = uuidv4();
  const registry = new AgentRegistryManager();
  
  // Check if name already exists
  const existing = registry.getAgentByName(name);
  if (existing) {
    log.error(`Agent with name "${name}" already exists (ID: ${existing.id})`);
    process.exit(1);
  }
  
  // Create workspace
  const workspace = registry.ensureAgentWorkspace(agentId);
  
  // Build command to start agent
  const cmd = process.argv[0]; // node
  const script = process.argv[1]; // clawx.js
  const args = [
    'agent', 'serve',
    '--id', agentId,
    '--name', name,
    '--workspace', workspace,
  ];
  
  log.info(`Spawning local agent: ${name} (${agentId})`);
  log.info(`Command: ${cmd} ${script} ${args.join(' ')}`);
  
  // TODO: Actually spawn process
  // For now, just register placeholder
  const agent = {
    id: agentId,
    name,
    type: 'local' as const,
    status: 'offline' as const,
    capabilities: [],
    workspace,
    created: Date.now(),
  };
  
  registry.upsertAgent(agent);
  registry.save();
  
  console.log(`Agent "${name}" registered (ID: ${agentId})`);
  console.log(`Workspace: ${workspace}`);
  console.log('\nNote: Process spawning not implemented in v1.');
  console.log('To start agent manually:');
  console.log(`  ${cmd} ${script} agent serve --id ${agentId} --name ${name}`);
}