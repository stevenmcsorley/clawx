/**
 * Git status tool for Clawdex.
 *
 * EXTRACTION NOTE: OpenClaw does not expose git tools to the model.
 * Written fresh as simple wrappers around `git` CLI.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const GitStatusSchema = Type.Object({
  path: Type.Optional(
    Type.String({ description: "Directory to check status in (default: working directory)" }),
  ),
});

type GitStatusInput = Static<typeof GitStatusSchema>;

export function createGitStatusTool(
  defaultCwd: string,
): AgentTool<typeof GitStatusSchema> {
  return {
    name: "git_status",
    label: "Git Status",
    description: "Show the working tree status of a git repository",
    parameters: GitStatusSchema,
    async execute(
      _toolCallId: string,
      params: GitStatusInput,
    ): Promise<AgentToolResult<unknown>> {
      const cwd = params.path || defaultCwd;
      try {
        const { stdout } = await execFileAsync("git", ["status", "--porcelain=v2", "--branch"], {
          cwd,
          timeout: 10_000,
          encoding: "utf-8",
        });
        return {
          content: [{ type: "text", text: stdout.trim() || "(clean working tree)" }],
          details: {},
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `git status error: ${msg}` }],
          details: {},
        };
      }
    },
  };
}
