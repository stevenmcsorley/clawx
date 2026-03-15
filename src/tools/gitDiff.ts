/**
 * Git diff tool for Clawdex.
 * Written fresh — not present in OpenClaw as a model tool.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const GitDiffSchema = Type.Object({
  path: Type.Optional(
    Type.String({ description: "Directory to diff in (default: working directory)" }),
  ),
  staged: Type.Optional(
    Type.Boolean({ description: "Show staged changes only (default: false)" }),
  ),
  file: Type.Optional(
    Type.String({ description: "Specific file to diff" }),
  ),
});

type GitDiffInput = Static<typeof GitDiffSchema>;

export function createGitDiffTool(
  defaultCwd: string,
): AgentTool<typeof GitDiffSchema> {
  return {
    name: "git_diff",
    label: "Git Diff",
    description: "Show file differences in a git repository",
    parameters: GitDiffSchema,
    async execute(
      _toolCallId: string,
      params: GitDiffInput,
    ): Promise<AgentToolResult<unknown>> {
      const cwd = params.path || defaultCwd;
      const args = ["diff"];
      if (params.staged) args.push("--cached");
      args.push("--stat", "--patch");
      if (params.file) args.push("--", params.file);

      try {
        const { stdout } = await execFileAsync("git", args, {
          cwd,
          timeout: 10_000,
          maxBuffer: 1024 * 1024,
          encoding: "utf-8",
        });
        return {
          content: [{ type: "text", text: stdout.trim() || "(no differences)" }],
          details: {},
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `git diff error: ${msg}` }],
          details: {},
        };
      }
    },
  };
}
