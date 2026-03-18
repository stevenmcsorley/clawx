/**
 * Forge List Capabilities tool.
 *
 * Lists existing tool extensions in ~/.clawx/extensions/
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { join } from 'path';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';

const ForgeListCapabilitiesSchema = Type.Object({
  // No parameters needed for listing
});

type ForgeListCapabilitiesInput = Static<typeof ForgeListCapabilitiesSchema>;

export interface ForgeListCapabilitiesDetails {
  count: number;
  extensions: Array<{
    name: string;
    path: string;
    type: string;
    description: string;
    createdAt: string;
    enabled: boolean;
  }>;
}

export function createForgeListCapabilitiesTool(): AgentTool<typeof ForgeListCapabilitiesSchema, ForgeListCapabilitiesDetails> {
  return {
    name: "forge_list_capabilities",
    label: "Forge List Capabilities",
    description:
      "List existing tool extensions in ~/.clawx/extensions/. " +
      "Shows name, description, type, and status.",
    parameters: ForgeListCapabilitiesSchema,
    async execute(
      _toolCallId: string,
      _params: ForgeListCapabilitiesInput,
    ): Promise<AgentToolResult<ForgeListCapabilitiesDetails>> {
      try {
        // Determine home directory
        const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
        const extensionsDir = join(homeDir, '.clawx', 'extensions');

        // Check if extensions directory exists
        if (!existsSync(extensionsDir)) {
          const text = "No extensions found. The extensions directory doesn't exist yet.\n" +
                "Create your first extension with forge_write_capability.";
          return {
            content: [{ type: "text", text }],
            details: {
              count: 0,
              extensions: [],
            },
          };
        }

        // List directories in extensions folder
        const entries = readdirSync(extensionsDir, { withFileTypes: true });
        const extensionDirs = entries.filter(entry => entry.isDirectory());

        if (extensionDirs.length === 0) {
          const text = "No extensions found in ~/.clawx/extensions/\n" +
                "Create your first extension with forge_write_capability.";
          return {
            content: [{ type: "text", text }],
            details: {
              count: 0,
              extensions: [],
            },
          };
        }

        // Read capability.json for each extension
        const extensions = [];
        for (const dir of extensionDirs) {
          const toolDir = join(extensionsDir, dir.name);
          const capabilityPath = join(toolDir, 'capability.json');
          
          if (existsSync(capabilityPath)) {
            try {
              const capabilityJson = JSON.parse(readFileSync(capabilityPath, 'utf8'));
              
              // Check if tool.ts exists
              const toolPath = join(toolDir, 'tool.ts');
              const hasToolFile = existsSync(toolPath);
              
              // Check if README.md exists
              const readmePath = join(toolDir, 'README.md');
              const hasReadmeFile = existsSync(readmePath);
              
              extensions.push({
                name: dir.name,
                path: toolDir,
                type: capabilityJson.type || 'unknown',
                description: capabilityJson.description || 'No description',
                createdAt: capabilityJson.createdAt || 'Unknown',
                enabled: capabilityJson.enabled === true,
                files: {
                  capability: true,
                  tool: hasToolFile,
                  readme: hasReadmeFile,
                },
              });
            } catch (error) {
              // Skip invalid JSON
              extensions.push({
                name: dir.name,
                path: toolDir,
                type: 'invalid',
                description: 'Invalid capability.json',
                createdAt: 'Unknown',
                enabled: false,
                files: {
                  capability: false,
                  tool: false,
                  readme: false,
                },
              });
            }
          } else {
            // Directory exists but no capability.json
            extensions.push({
              name: dir.name,
              path: toolDir,
              type: 'incomplete',
              description: 'Missing capability.json',
              createdAt: 'Unknown',
              enabled: false,
              files: {
                capability: false,
                tool: false,
                readme: false,
              },
            });
          }
        }

        // Format output
        const formatted = extensions.map((ext, i) => {
          const status = ext.enabled ? '🟢 Enabled' : '⚪ Disabled';
          const filesStatus = [
            ext.files.capability ? '📄' : '❌',
            ext.files.tool ? '🔧' : '❌',
            ext.files.readme ? '📖' : '❌',
          ].join(' ');
          
          return `${i + 1}. ${ext.name}\n` +
                 `   📝 ${ext.description}\n` +
                 `   🏷️  Type: ${ext.type} | ${status}\n` +
                 `   📁 Files: ${filesStatus} (manifest/tool/readme)\n` +
                 `   📅 Created: ${ext.createdAt}\n` +
                 `   📍 Path: ${ext.path}\n`;
        }).join('\n');

        const text = `Found ${extensions.length} extension(s):\n\n${formatted}\n\n` +
              `Use forge_write_capability to create new extensions.`;

        return {
          content: [{ type: "text", text }],
          details: {
            count: extensions.length,
            extensions: extensions.map(ext => ({
              name: ext.name,
              path: ext.path,
              type: ext.type,
              description: ext.description,
              createdAt: ext.createdAt,
              enabled: ext.enabled,
            })),
          },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to list extensions: ${error instanceof Error ? error.message : String(error)}` }],
          details: {
            count: 0,
            extensions: [],
          },
        };
      }
    },
  };
}