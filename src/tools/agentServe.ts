/**
 * Agent Serve Tool
 * 
 * Make current Clawx instance a networked agent.
 */

import { ToolDefinition } from '../types/extension.js';
import { log } from '../utils/logger.js';
import { startAgentServer } from '../core/agent-server.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { v4 as uuidv4 } from 'uuid';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

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
        description: 'Port to listen on (default: 3000)',
        default: 3000,
      },
      allowed_tools: {
        type: 'array',
        description: 'Tools this agent can execute (empty = all)',
        items: { type: 'string' },
        default: [],
      },
    },
    required: [],
  },
  
  async execute(params: any, context: any) {
    const name = params.name || 'master';
    const port = params.port || 3000;
    const allowedTools = params.allowed_tools || [];
    
    try {
      // Check if already serving
      if (context._agentServer) {
        return {
          content: [{ type: 'text', text: 'Already serving as agent' }],
          details: { already_serving: true },
        };
      }
      
      const agentId = uuidv4();
      const workspace = join(homedir(), '.clawx', 'agents', agentId);
      
      if (!existsSync(workspace)) {
        mkdirSync(workspace, { recursive: true });
      }
      
      // Create agent config
      const config = {
        id: agentId,
        name,
        port,
        workspace,
        masterEndpoint: `http://localhost:${port}`, // Self as master
        allowedTools,
      };
      
      const configPath = join(workspace, 'agent-config.json');
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      
      log.info(`Starting agent server: ${name} (${agentId}) on port ${port}`);
      
      // Start server
      const server = await startAgentServer(config);
      
      // Store in context for later access
      context._agentServer = server;
      context._agentConfig = config;
      
      // Register self in registry
      const registry = new AgentRegistryManager();
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
      
      // The agent server already has /register-worker endpoint
      // No need to add custom endpoint
      
      return {
        content: [{
          type: 'text',
          text: `✅ Now serving as agent "${name}" (ID: ${agentId})\n` +
                `Endpoint: http://localhost:${server.port}\n` +
                `Workspace: ${workspace}\n` +
                `Allowed tools: ${allowedTools.length > 0 ? allowedTools.join(', ') : 'all'}\n\n` +
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
          config_path: configPath,
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