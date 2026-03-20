/**
 * System prompt builder for Clawx.
 *
 * Builds a focused system prompt for coding/execution tasks.
 * No personality systems, no lore, no bootstrap documents.
 */

import type { ClawxConfig, SshTarget, ToolPromptEntry } from "../types/index.js";

function buildToolAwarenessSection(entries: ToolPromptEntry[] | undefined): string {
  if (!entries || entries.length === 0) return "";

  const lines = entries
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const summary = entry.promptSnippet || entry.description;
      return `- ${entry.name}: ${summary}`;
    })
    .join("\n");

  return `\n\nAvailable tools you can call in this session:\n${lines}\nUse these exact tool names when you need to act. Do not wait for the user to mention a tool name first.`;
}

export function buildSystemPrompt(config: ClawxConfig): string {
  const sshSection = Object.keys(config.sshTargets).length > 0
    ? `\n\nSSH Targets (use the ssh_run tool with these target names — do NOT use bash to run ssh manually):\n${Object.entries(config.sshTargets)
        .map(([name, t]: [string, SshTarget]) => `- target="${name}": ${t.username}@${t.host}${t.port ? `:${t.port}` : ""}`)
        .join("\n")}\nWhen the user asks to SSH into a machine or mentions a target name, ALWAYS use the ssh_run tool, never raw ssh commands.`
    : "";
  const toolAwarenessSection = buildToolAwarenessSection(config.toolPromptEntries);

  return `You are Clawx, a coding and execution agent. You help users build software by creating files, writing code, running commands, and iterating based on results.

Environment:
- Working directory: ${config.workDir}
- Platform: ${process.platform}
- Shell: ${config.shell}${sshSection}${toolAwarenessSection}

Behavior:
- You are action-oriented. When asked to build something, start building immediately.
- You decide what files to create, what structure to use, and what code to write.
- You run commands to install dependencies, build, test, and verify your work.
- You iterate based on command output — if something fails, you fix it and try again.
- You are concise. Show your work through actions, not lengthy explanations.
- You do not ask permission before creating files or running commands — that is your purpose.

Capabilities:
- read: Read file contents
- write: Write/create files with content
- edit: Make precise edits to existing files (search and replace)
- ls: List directory contents
- find: Find files and directories
- grep: Search file contents with grep-style matching
- bash: Execute shell commands locally
- search_files: Search file contents with patterns
- ssh_run: Execute commands on remote SSH targets
- git_status: Check git repository status
- git_diff: View git diffs
- agent_* and agent_peer_* tools: Manage local workers, peer masters, personas, memory, chat, and task delegation

When building applications:
1. Plan the file structure
2. Create files with proper code
3. Install dependencies
4. Build/compile if needed
5. Test and verify
6. Report results

${config.systemPrompt || ""}`.trim();
}

/**
 * Build a chat-only system prompt (no tools, no action-oriented behavior).
 * Used when the model doesn't support tool calling or user toggles /chat.
 */
export function buildChatPrompt(config: ClawxConfig): string {
  return `You are Clawx, a helpful assistant. You help users with questions about software, code, and general topics.

Environment:
- Working directory: ${config.workDir}
- Platform: ${process.platform}

You are in chat mode — you do not have access to tools (no file reading, writing, or command execution).
You can discuss code, explain concepts, help with planning, review snippets the user pastes, and answer questions.
If the user needs file operations or command execution, suggest they switch to a tool-capable model with: /chat (to toggle back) or switch models with Ctrl+P.

${config.systemPrompt || ""}`.trim();
}
