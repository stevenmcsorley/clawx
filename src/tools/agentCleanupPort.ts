/**
 * Agent Cleanup Port Tool
 * 
 * Clean up orphaned processes on a specific port.
 */

import { ToolDefinition } from '../types/extension.js';
import { log } from '../utils/logger.js';
import { killProcessOnPort, isPortInUse } from '../utils/agent-utils.js';

export const agentCleanupPortTool: ToolDefinition = {
  name: 'agent_cleanup_port',
  label: 'Cleanup Port',
  description: 'Clean up orphaned processes on a specific port',
  parameters: {
    type: 'object',
    properties: {
      port: {
        type: 'number',
        description: 'Port to clean up',
      },
      force: {
        type: 'boolean',
        description: 'Force cleanup without confirmation',
        default: false,
      },
    },
    required: ['port'],
  },
  
  async execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any, context?: any) {
    const port = params.port;
    const force = params.force === true;
    
    if (!port || typeof port !== 'number' || port < 1 || port > 65535) {
      return {
        content: [{
          type: 'text',
          text: '❌ Valid port number required (1-65535)',
        }],
        details: { error: 'Invalid port' },
        isError: true,
      };
    }
    
    try {
      // Check if port is actually in use
      const inUse = await isPortInUse(port);
      if (!inUse) {
        return {
          content: [{
            type: 'text',
            text: `✅ Port ${port} is not in use, no cleanup needed.`,
          }],
          details: { port, in_use: false, cleaned: false },
        };
      }
      
      let output = `## Port ${port} Cleanup\n\n`;
      output += `Port ${port} is currently in use.\n\n`;
      
      if (!force) {
        output += `**Warning**: This will kill any process using port ${port}.\n`;
        output += `Only proceed if you're sure it's an orphaned agent process.\n`;
        output += `Add \`--force true\` to skip this warning.\n`;
        
        return {
          content: [{ type: 'text', text: output }],
          details: { 
            port, 
            in_use: true, 
            needs_confirmation: true,
            message: 'Add --force true to confirm cleanup' 
          },
        };
      }
      
      output += `Attempting to kill process on port ${port}...\n`;
      
      const killed = await killProcessOnPort(port);
      
      if (killed) {
        output += `✅ Successfully killed process on port ${port}\n`;
        output += `You can now use this port for agent_serve.\n`;
      } else {
        output += `❌ Could not kill process on port ${port}\n`;
        output += `The port may be in use by a system process or another application.\n`;
        output += `Try a different port or restart your computer.\n`;
      }
      
      // Verify cleanup
      const stillInUse = await isPortInUse(port);
      if (!stillInUse) {
        output += `\n✅ Verification: Port ${port} is now free.\n`;
      } else {
        output += `\n⚠️  Verification: Port ${port} is still in use.\n`;
        output += `The process may have restarted or requires admin privileges to kill.\n`;
      }
      
      return {
        content: [{ type: 'text', text: output }],
        details: {
          port,
          in_use_before: true,
          in_use_after: stillInUse,
          killed,
          platform: process.platform,
        },
      };
      
    } catch (error) {
      log.error('Port cleanup failed:', error);
      return {
        content: [{
          type: 'text',
          text: `❌ Port cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
        }],
        details: { error: error instanceof Error ? error.message : String(error) },
        isError: true,
      };
    }
  },
};