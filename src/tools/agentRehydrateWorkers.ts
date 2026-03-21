import { ToolDefinition } from '../types/extension.js';
import { AgentRegistryManager } from '../core/agent-registry.js';
import { agentMaster } from '../core/agent-master.js';
import { checkAgentHealth } from '../utils/agent-utils.js';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';
import { log } from '../utils/logger.js';

export const agentRehydrateWorkersTool: ToolDefinition = {
  name: 'agent_rehydrate_workers',
  label: 'Rehydrate Workers',
  description: 'Restore persisted local workers for the current master',
  parameters: {
    type: 'object',
    properties: {
      names: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional worker names to rehydrate',
        default: [],
      },
      include_offline: {
        type: 'boolean',
        description: 'Include offline workers in scan (default true)',
        default: true,
      },
      only_current_master: {
        type: 'boolean',
        description: 'Only rehydrate workers owned by the current master',
        default: true,
      },
    },
    required: [],
  },

  async execute(_toolCallId: string, params: any, _signal?: AbortSignal, _onUpdate?: any, context?: any) {
    try {
      const registry = new AgentRegistryManager();
      const masterConfig = context?.__activeMasterConfig || agentMaster.getConfig();
      const masterEndpoint = context?.masterEndpoint || context?.master_endpoint || agentMaster.getEndpoint() || masterConfig?.masterEndpoint;

      if (!masterConfig || !masterEndpoint) {
        return {
          content: [{ type: 'text', text: '❌ No active master context. Start a master first with agent_serve.' }],
          isError: true,
          details: { error: 'no_active_master' },
        };
      }

      const requestedNames = Array.isArray(params.names) ? new Set(params.names) : null;
      const onlyCurrentMaster = params.only_current_master !== false;
      const includeOffline = params.include_offline !== false;

      const allAgents = registry.getAgents();
      const agentsDir = join(homedir(), '.clawx', 'agents');
      const discoveredWorkers: Array<{ agent: any; workerConfig: any; configPath: string }> = [];

      if (existsSync(agentsDir)) {
        for (const entry of readdirSync(agentsDir)) {
          const workspace = join(agentsDir, entry);
          try {
            if (!statSync(workspace).isDirectory()) continue;
          } catch {
            continue;
          }

          const configPath = join(workspace, 'agent-config.json');
          if (!existsSync(configPath)) continue;

          try {
            const workerConfig = JSON.parse(readFileSync(configPath, 'utf8'));
            const registryAgent = allAgents.find(a => a.id === workerConfig.id);
            const syntheticAgent = registryAgent || {
              id: workerConfig.id,
              name: workerConfig.name,
              type: 'local',
              status: 'offline',
              capabilities: Array.isArray(workerConfig.allowedTools) && workerConfig.allowedTools.length > 0 ? workerConfig.allowedTools : ['all'],
              endpoint: workerConfig.port ? `http://localhost:${workerConfig.port}` : undefined,
              workspace: workerConfig.workspace || workspace,
              created: Date.now(),
              ownerMasterId: workerConfig.ownerMasterId,
              ownerMasterName: workerConfig.ownerMasterName,
              ownerMasterEndpoint: workerConfig.ownerMasterEndpoint,
              autoStart: workerConfig.autoStart,
            };
            discoveredWorkers.push({ agent: syntheticAgent, workerConfig, configPath });
          } catch {
            // ignore invalid configs here; handled later if matched
          }
        }
      }

      const agents = discoveredWorkers.filter(({ agent, workerConfig }) => {
        if (agent.type !== 'local') return false;
        if (!includeOffline && agent.status === 'offline') return false;
        if (requestedNames && requestedNames.size > 0 && !requestedNames.has(agent.name)) return false;
        if (!onlyCurrentMaster) return true;

        const ownerMatches =
          (!!workerConfig.ownerMasterEndpoint && workerConfig.ownerMasterEndpoint === masterEndpoint) ||
          (!!workerConfig.ownerMasterName && workerConfig.ownerMasterName === masterConfig.name) ||
          (!!workerConfig.ownerMasterId && workerConfig.ownerMasterId === masterConfig.id) ||
          (!!agent.ownerMasterEndpoint && agent.ownerMasterEndpoint === masterEndpoint) ||
          (!!agent.ownerMasterName && agent.ownerMasterName === masterConfig.name) ||
          (!!agent.ownerMasterId && agent.ownerMasterId === masterConfig.id);

        return ownerMatches;
      });

      if (agents.length === 0) {
        const debugLines = [
          'No persisted local workers matched the rehydration filter.',
          `Current master id: ${masterConfig.id || 'unknown'}`,
          `Current master name: ${masterConfig.name || 'unknown'}`,
          `Current master endpoint: ${masterEndpoint || 'unknown'}`,
        ];
        const candidateLocals = discoveredWorkers.map(({ agent, workerConfig }) => ({ agent, workerConfig }));
        if (candidateLocals.length > 0) {
          debugLines.push('', 'Persisted local workers seen:');
          for (const { agent, workerConfig } of candidateLocals) {
            debugLines.push(`- ${agent.name} | cfg.ownerMasterId=${workerConfig.ownerMasterId || 'none'} | cfg.ownerMasterName=${workerConfig.ownerMasterName || 'none'} | cfg.ownerMasterEndpoint=${workerConfig.ownerMasterEndpoint || 'none'} | reg.ownerMasterId=${agent.ownerMasterId || 'none'} | reg.ownerMasterName=${agent.ownerMasterName || 'none'} | reg.ownerMasterEndpoint=${agent.ownerMasterEndpoint || 'none'}`);
          }
        }
        return {
          content: [{ type: 'text', text: debugLines.join('\n') }],
          details: { matched: 0, restored: 0, alive: 0, failed: 0 },
        };
      }

      const alive: string[] = [];
      const restored: string[] = [];
      const failed: string[] = [];
      const skipped: string[] = [];

      log.info(`[rehydrate] matched ${agents.length} worker(s) for master ${masterConfig.name} @ ${masterEndpoint}`);

      for (const entry of agents) {
        const agent = entry.agent;
        const configPath = entry.configPath;
        const workerConfig = entry.workerConfig;
        log.info(`[rehydrate] processing ${agent.name} (${agent.id}) from ${configPath}`);
        if (!existsSync(configPath)) {
          failed.push(`${agent.name}: missing agent-config.json`);
          continue;
        }

        const endpoint = agent.endpoint || `http://localhost:${workerConfig.port}`;
        let healthy = false;
        try {
          healthy = await checkAgentHealth(endpoint, 2000);
          log.info(`[rehydrate] health check for ${agent.name} at ${endpoint}: ${healthy}`);
          if (healthy) {
            const healthResponse = await fetch(`${endpoint}/health`);
            if (healthResponse.ok) {
              const healthJson = await healthResponse.json() as any;
              log.info(`[rehydrate] ${agent.name} health agentId=${healthJson?.agentId || 'unknown'}`);
              if (healthJson?.agentId === agent.id) {
                agent.status = 'idle';
                agent.lastHeartbeat = Date.now();
                registry.upsertAgent(agent);
                alive.push(agent.name);
                log.info(`[rehydrate] ${agent.name} already alive`);
                continue;
              }
            }
          }
        } catch (error) {
          log.info(`[rehydrate] ${agent.name} alive check failed: ${error instanceof Error ? error.message : String(error)}`);
          // continue to respawn path
        }

        const args = [
          'agent', 'serve',
          '--id', workerConfig.id,
          '--name', workerConfig.name,
          '--port', String(workerConfig.port),
          '--master', workerConfig.masterEndpoint || masterEndpoint,
          '--workspace', workerConfig.workspace,
          '--verbose',
        ];

        if (workerConfig.masterWorkspace) {
          args.push('--master-workspace', workerConfig.masterWorkspace);
        }

        const healthResponse = await fetch(`${masterEndpoint}/health`);
        if (healthResponse.ok) {
          const healthJson = await healthResponse.json() as any;
          if (healthJson?.grpcPort) {
            args.push('--grpc-master', `grpc://localhost:${healthJson.grpcPort}`);
          }
        }

        if (Array.isArray(workerConfig.allowedTools) && workerConfig.allowedTools.length > 0) {
          args.push('--allowed-tools', workerConfig.allowedTools.join(','));
        }

        log.info(`[rehydrate] respawning ${agent.name} on port ${workerConfig.port}`);
        const child = spawn(process.execPath, [process.argv[1], ...args], {
          cwd: workerConfig.workspace,
          stdio: ['ignore', 'ignore', 'ignore'],
          detached: true,
          shell: false,
          windowsHide: true,
        });

        try { child.unref(); } catch {}

        let restoredHealthy = false;
        const start = Date.now();
        while (Date.now() - start < 15000) {
          try {
            const ok = await checkAgentHealth(endpoint, 2000);
            log.info(`[rehydrate] poll ${agent.name} health=${ok}`);
            if (ok) {
              const verify = await fetch(`${endpoint}/health`);
              if (verify.ok) {
                const verifyJson = await verify.json() as any;
                log.info(`[rehydrate] poll ${agent.name} agentId=${verifyJson?.agentId || 'unknown'}`);
                if (verifyJson?.agentId === agent.id) {
                  restoredHealthy = true;
                  break;
                }
              }
            }
          } catch (error) {
            log.info(`[rehydrate] poll ${agent.name} error: ${error instanceof Error ? error.message : String(error)}`);
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (restoredHealthy) {
          agent.status = 'idle';
          agent.lastHeartbeat = Date.now();
          registry.upsertAgent(agent);
          restored.push(agent.name);
          log.info(`[rehydrate] restored ${agent.name}`);
        } else {
          agent.status = 'offline';
          agent.lastHeartbeat = Date.now();
          registry.upsertAgent(agent);
          failed.push(`${agent.name}: failed to restore`);
          log.warn(`[rehydrate] failed to restore ${agent.name}`);
        }
      }

      registry.save();

      const lines: string[] = [];
      lines.push(`♻️ Worker Rehydration`);
      lines.push('');
      lines.push(`Matched: ${agents.length}`);
      lines.push(`Already alive: ${alive.length}`);
      lines.push(`Restored: ${restored.length}`);
      lines.push(`Failed: ${failed.length}`);
      if (alive.length > 0) {
        lines.push('');
        lines.push(`Alive:`);
        for (const name of alive) lines.push(`- ${name}`);
      }
      if (restored.length > 0) {
        lines.push('');
        lines.push(`Restored:`);
        for (const name of restored) lines.push(`- ${name}`);
      }
      if (failed.length > 0) {
        lines.push('');
        lines.push(`Failed:`);
        for (const name of failed) lines.push(`- ${name}`);
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        details: {
          matched: agents.length,
          alive,
          restored,
          failed,
          skipped,
        },
        isError: failed.length > 0 && restored.length === 0 && alive.length === 0,
      };
    } catch (error) {
      log.error('Failed to rehydrate workers:', error);
      return {
        content: [{ type: 'text', text: `❌ Failed to rehydrate workers: ${error instanceof Error ? error.message : String(error)}` }],
        details: { error: error instanceof Error ? error.message : String(error) },
        isError: true,
      };
    }
  },
};
