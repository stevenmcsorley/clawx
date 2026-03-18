/**
 * Forge Write Capability tool.
 *
 * Creates a new tool extension scaffold in ~/.clawx/extensions/
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { join } from 'path';
import { mkdirSync, writeFileSync, existsSync } from 'fs';

const ForgeWriteCapabilitySchema = Type.Object({
  name: Type.String({ 
    description: "Tool name in kebab-case (e.g., 'medical-classifier', 'image-captioner')" 
  }),
  description: Type.String({ 
    description: "What the tool does" 
  }),
  modelId: Type.Optional(Type.String({ 
    description: "Optional: HuggingFace model ID used by this tool" 
  })),
  datasetId: Type.Optional(Type.String({ 
    description: "Optional: HuggingFace dataset ID used by this tool" 
  })),
  toolImplementation: Type.String({ 
    description: "TypeScript implementation code for tool.ts" 
  }),
  readmeContent: Type.String({ 
    description: "Markdown content for README.md (will have disclaimer added)" 
  }),
});

type ForgeWriteCapabilityInput = Static<typeof ForgeWriteCapabilitySchema>;

export interface ForgeWriteCapabilityDetails {
  name: string;
  path: string;
  filesCreated: string[];
}

export function createForgeWriteCapabilityTool(): AgentTool<typeof ForgeWriteCapabilitySchema, ForgeWriteCapabilityDetails> {
  return {
    name: "forge_write_capability",
    label: "Forge Write Capability",
    description:
      "Create a new tool extension scaffold in ~/.clawx/extensions/. " +
      "Generates capability.json, tool.ts, and README.md with scaffold disclaimer.",
    parameters: ForgeWriteCapabilitySchema,
    async execute(
      _toolCallId: string,
      params: ForgeWriteCapabilityInput,
    ): Promise<AgentToolResult<ForgeWriteCapabilityDetails>> {
      try {
        // Validate name (kebab-case)
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(params.name)) {
          return {
            content: [{ type: "text", text: `Invalid tool name: "${params.name}". Must be kebab-case (lowercase letters, numbers, hyphens).` }],
            details: {
              name: params.name,
              path: "",
              filesCreated: [],
            },
          };
        }

        // Determine home directory
        const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
        const extensionsDir = join(homeDir, '.clawx', 'extensions');
        const toolDir = join(extensionsDir, params.name);

        // Check if already exists
        if (existsSync(toolDir)) {
          return {
            content: [{ type: "text", text: `Extension "${params.name}" already exists at ${toolDir}` }],
            details: {
              name: params.name,
              path: toolDir,
              filesCreated: [],
            },
          };
        }

        // Create directories
        mkdirSync(extensionsDir, { recursive: true });
        mkdirSync(toolDir, { recursive: true });

        // Generate ID
        const id = `ext_${Math.random().toString(36).substring(2, 8)}`;

              // Extract tool name from implementation (first line like "name: 'tool_name'")
        let toolName = params.name.replace(/-/g, '_');
        const nameMatch = params.toolImplementation.match(/name:\s*['"]([^'"]+)['"]/);
        if (nameMatch) {
          toolName = nameMatch[1];
        }

        // 1. Create capability.json (new format for real extensions)
        const capabilityJson = {
          name: params.name,
          version: "1.0.0",
          type: "tool" as const,
          enabled: false,  // Default: disabled for safety
          description: params.description,
          entrypoint: "./tool.js",  // Must be .js file for loading
          dependencies: params.modelId ? {
            "@huggingface/inference": "^2.0.0"
          } : undefined,
          tool: {
            name: toolName,
            label: params.name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
            description: params.description,
            parameters: {
              type: "object",
              properties: {
                // Will be filled by the model in toolImplementation
              },
              required: []
            }
          }
        };

        const capabilityPath = join(toolDir, 'capability.json');
        writeFileSync(capabilityPath, JSON.stringify(capabilityJson, null, 2));

        // 2. Create tool.ts (TypeScript source)
        const toolPath = join(toolDir, 'tool.ts');
        writeFileSync(toolPath, params.toolImplementation);

        // 3. Create package.json for building
        const packageJson = {
          name: `@clawx-extension/${params.name}`,
          version: "1.0.0",
          type: "module",
          main: "./tool.js",
          scripts: {
            build: "tsc tool.ts --target es2022 --module es2022 --outDir ."
          },
          dependencies: params.modelId ? {
            "@huggingface/inference": "^2.0.0"
          } : {},
          devDependencies: {
            "typescript": "^5.0.0"
          }
        };

        const packagePath = join(toolDir, 'package.json');
        writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));

        // 4. Create README.md with build instructions
        const disclaimer = `# ${params.name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} Extension

> **Forge-generated extension**
> 
> This extension was generated by Clawx Forge. To use it:

## 1. Build the extension
\`\`\`bash
cd ${toolDir}
npm install
npm run build
\`\`\`

## 2. Enable the extension
Edit \`capability.json\` and set \`"enabled": true\`

## 3. Restart Clawx
The tool will be available in your next Clawx session.

## Extension Details
${params.readmeContent}

## Notes
- The extension starts disabled (\`"enabled": false\`) for safety
- You must build it to JavaScript before Clawx can load it
- If dependencies are missing, Clawx will skip this extension with a warning
`;

        const readmePath = join(toolDir, 'README.md');
        writeFileSync(readmePath, disclaimer);

        const filesCreated = ['capability.json', 'tool.ts', 'package.json', 'README.md'];
        const text = `✅ Extension "${params.name}" created successfully!\n\n` +
              `Location: ${toolDir}\n` +
              `Files created:\n` +
              `  • capability.json (manifest with entrypoint: "./tool.js")\n` +
              `  • tool.ts (TypeScript implementation)\n` +
              `  • package.json (build configuration)\n` +
              `  • README.md (build instructions)\n\n` +
              `## To use this extension:\n` +
              `1. Build it: \`cd ${toolDir} && npm install && npm run build\`\n` +
              `2. Enable it: Edit \`capability.json\` and set \`"enabled": true\`\n` +
              `3. Restart Clawx: The tool will load automatically\n\n` +
              `**Note**: The extension starts disabled for safety.`;

        return {
          content: [{ type: "text", text }],
          details: {
            name: params.name,
            path: toolDir,
            filesCreated,
          },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to create extension: ${error instanceof Error ? error.message : String(error)}` }],
          details: {
            name: params.name,
            path: "",
            filesCreated: [],
          },
        };
      }
    },
  };
}