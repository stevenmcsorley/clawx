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
          // Implementation metadata for transparency
          implementation_metadata: {
            approach: params.modelId ? "small_hf_model" : "needs_assessment",
            model_id: params.modelId || null,
            estimated_size_mb: params.modelId ? "needs_research" : null,
            dependencies: params.modelId ? ["@huggingface/inference"] : []
          },
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

        // 2. Create tool.ts (TypeScript source) with hardened template
        let toolImplementation = params.toolImplementation;
        
        // Ensure proper formatting and implementation marking
        const hardenedTemplate = `/**
 * ${params.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Tool
 * 
 * IMPORTANT: Tool must return AgentToolResult format:
 * {
 *   content: [{ type: "text", text: "result text here" }],
 *   details: any // additional structured data
 *   isError?: boolean // optional error flag
 * }
 * 
 * Implementation approach: ${params.modelId ? 'HF model: ' + params.modelId : 'plain code'}
 * ${params.modelId ? 'Model size: needs verification' : 'No external dependencies'}
 */

// PRIMARY IMPLEMENTATION: ${params.modelId ? 'HF model inference' : 'plain code logic'}
// ${params.modelId ? 'FALLBACK: Rule-based alternative if HF fails' : 'NO FALLBACK: Deterministic implementation'}
// TODO: ${params.modelId ? 'Verify model size and requirements' : 'None - implementation complete'}

${toolImplementation}`;
        
        const toolPath = join(toolDir, 'tool.ts');
        writeFileSync(toolPath, hardenedTemplate);

        // 3. Create package.json with minimal, working configuration
        const packageJson = {
          name: `@clawx-extension/${params.name}`,
          version: "1.0.0",
          type: "module",
          main: "./tool.js",
          scripts: {
            build: "tsc tool.ts --target es2022 --module es2022 --outDir . --skipLibCheck"
          },
          dependencies: params.modelId ? {
            "@huggingface/inference": "^2.0.0"
          } : {},
          devDependencies: {
            "typescript": "^5.0.0",
            "@types/node": "^20.0.0"
          },
          // Build assurance metadata
          _forge_generated: true,
          _build_assurance: "npm install && npm run build should work first time"
        };

        const packagePath = join(toolDir, 'package.json');
        writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));

        // 4. Create README.md with honest, short instructions
        const extensionName = params.name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        const disclaimer = `# ${extensionName} Extension

## Build & Enable
\`\`\`bash
cd ${toolDir}
npm install
npm run build
\`\`\`

Then edit \`capability.json\` and set \`"enabled": true\`.

Restart Clawx to load the extension.

## Implementation
${params.modelId ? `**Uses HF model:** ${params.modelId}` : '**Plain code implementation:** No external dependencies'}

${params.modelId ? '**Note:** Model size and requirements need verification' : '**Note:** Deterministic implementation, no ML'}

## Limitations
- Generated by Clawx Forge
- Starts disabled for safety
- ${params.modelId ? 'Requires HF_TOKEN environment variable' : 'No external dependencies'}
- Test before production use

${params.readmeContent ? `\n## Details\n${params.readmeContent}` : ''}
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