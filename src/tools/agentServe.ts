/**
 * Agent Serve Tool
 * 
 * Make current Clawx instance a networked agent.
 */

import { ToolDefinition } from '../types/extension.js';
import { log } from '../utils/logger.js';
import { startAgentServer } from '../core/agent-server.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { agentMaster } from '../core/agent-master.js';
import { v4 as uuidv4 } from 'uuid';
import { join } from 'path';
import { startPeerObserverTui } from '../cli/agent-peer-observer.js';
import { homedir } from 'os';
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'fs';

export const agentServeTool: ToolDefinition = {
  name: 'agent_serve',
  label: 'Serve as Agent',
  description: 'Make current Clawx instance a networked agent',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Agent name (default: "master")',
        default: 'master',
      },
      port: {
        type: 'number',
        description: 'Port to listen on (0 = auto-select from master range)',
        default: 0,
      },
      allowed_tools: {
        type: 'array',
        description: 'Tools this agent can execute (empty = all)',
        items: { type: 'string' },
        default: [],
      },
      tui: {
        type: 'boolean',
        description: 'Also open a local TUI observer for incoming peer activity',
        default: false,
      },
    },
    required: [],
  },
  
  async execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any, context?: any) {
    log.debug('agent_serve toolCallId:', toolCallId);
    log.debug('agent_serve raw params:', params);
    
    // Handle case where params might be toolCallId
    let actualParams = params;
    if (typeof params === 'string' && params.startsWith('call_')) {
      log.warn('Received toolCallId as params, using default params');
      actualParams = {};
    }
    
    // Normalize parameter names
    const normalizedParams = {
      name: actualParams.name || actualParams.agent_name || 'master',
      port: actualParams.port || 0,
      allowed_tools: actualParams.allowed_tools || actualParams.allowedTools || [],
      tui: actualParams.tui === true,
    };
    
    log.debug('agent_serve normalized params:', normalizedParams);
    
    const name = normalizedParams.name;
    const requestedPort = normalizedParams.port;
    const allowedTools = normalizedParams.allowed_tools;
    const enableTui = normalizedParams.tui;
    
    try {
      // Check if already serving (using singleton)
      if (agentMaster.isServing()) {
        const config = agentMaster.getConfig();
        return {
          content: [{
            type: 'text',
            text: `Already serving as agent "${config?.name}" on port ${config?.port}`,
          }],
          details: { already_serving: true },
        };
      }
      
      const agentId = uuidv4();
      const workspace = join(homedir(), '.clawx', 'agents', agentId);
      
      if (!existsSync(workspace)) {
        mkdirSync(workspace, { recursive: true });
      }
      
      // Determine actual port with safety checks
      let actualPort: number;
      try {
        const { acquirePort } = await import('../utils/agent-utils.js');
        actualPort = await acquirePort(requestedPort, 'master');
        log.debug(`Acquired port: ${actualPort} (requested: ${requestedPort})`);
      } catch (error: any) {
        if (error.message.includes('already in use')) {
          return {
            content: [{
              type: 'text',
              text: `❌ ${error.message}\n\n` +
                    `Use \`agent_cleanup_port --port ${requestedPort} --force true\` to free the port,\n` +
                    `or try a different port with \`agent_serve --port <new_port>\`.`,
            }],
            details: { error: error.message, port: requestedPort },
            isError: true,
          };
        }
        throw error;
      }
      
      // Create agent config
      const config = {
        id: agentId,
        name,
        port: actualPort,
        workspace,
        masterEndpoint: `http://localhost:${actualPort}`, // Self as master
        allowedTools,
      };
      
      const configPath = join(workspace, 'agent-config.json');
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      const peerActivityLogPath = join(workspace, 'peer-activity.log');
      try {
        appendFileSync(peerActivityLogPath, `[${new Date().toISOString()}] agent_started name=${name} id=${agentId} port=${actualPort}\n`, 'utf8');
      } catch {}
      
      log.info(`Starting agent server: ${name} (${agentId}) on port ${actualPort}`);
      
      // Start server
      const server = await startAgentServer(config);
      
      // Store in singleton for later access
      agentMaster.setServer(server, config);
      
      // Register self in registry
      const registry = new AgentRegistryManager();
      
      // Remove any existing self agents to avoid duplicates
      const existingAgents = registry.getAgents();
      let removedCount = 0;
      for (const agent of existingAgents) {
        if (agent.type === 'self') {
          registry.removeAgent(agent.id);
          removedCount++;
          log.debug(`Removed existing self agent: ${agent.name} (${agent.id})`);
        }
      }
      
      const agentIdentity = {
        id: agentId,
        name,
        type: 'self' as const,
        status: 'idle' as const,
        capabilities: allowedTools.length > 0 ? allowedTools : ['all'],
        endpoint: `http://localhost:${server.port}`,
        workspace,
        created: Date.now(),
        lastHeartbeat: Date.now(),
      };
      
      registry.upsertAgent(agentIdentity);
      registry.save();
      
      if (removedCount > 0) {
        log.info(`Replaced ${removedCount} existing self agent(s)`);
      }
      
      // The agent server already has /register-worker endpoint
      // No need to add custom endpoint
      
      if (enableTui) {
        void startPeerObserverTui(workspace, name).catch((error) => {
          log.error('Peer observer TUI failed:', error);
        });
      }
      
      return {
        content: [{
          type: 'text',
          text: `✅ Now serving as agent "${name}" (ID: ${agentId})\n` +
                `Endpoint: http://localhost:${server.port}\n` +
                `Workspace: ${workspace}\n` +
                `Port: ${server.port} (requested: ${requestedPort === 0 ? 'auto' : requestedPort})\n` +
                `Debug: raw port param was "${params.port}", type ${typeof params.port}\n` +
                `Allowed tools: ${allowedTools.length > 0 ? allowedTools.join(', ') : 'all'}\n` +
                `Peer observer TUI: ${enableTui ? 'enabled' : 'disabled'}\n\n` +
                'Use agent_list to see registered agents.\n' +
                'Use agent_spawn_local to spawn worker agents.\n' +
                'Use agent_send to send tasks to agents.',
        }],
        details: {
          agent_id: agentId,
          agent_name: name,
          endpoint: `http://localhost:${server.port}`,
          workspace,
          allowed_tools: allowedTools,
          tui: enableTui,
          config_path: configPath,
          port: server.port,
          requested_port: requestedPort,
        },
      };
      
    } catch (error) {
      log.error('Failed to start agent server:', error);
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to start agent server: ${error instanceof Error ? error.message : String(error)}`,
        }],
        details: { error: error instanceof Error ? error.message : String(error) },
        isError: true,
      };
    }
  },
};