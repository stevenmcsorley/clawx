/**
 * File content search tool for Clawx.
 *
 * EXTRACTION NOTE:
 * pi-coding-agent provides `grepTool` and `findTool` as separate tools.
 * This is a unified search tool that combines both patterns for the model.
 * We expose the pi-coding-agent grep/find as the primary implementation.
 * This is a convenience wrapper that the model can use for broader searches.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SearchFilesSchema = Type.Object({
  pattern: Type.String({ description: "Search pattern (regex supported)" }),
  path: Type.Optional(
    Type.String({ description: "Directory to search in (default: working directory)" }),
  ),
  glob: Type.Optional(
    Type.String({ description: "File glob pattern to filter (e.g. '*.ts', '*.py')" }),
  ),
  maxResults: Type.Optional(
    Type.Number({ description: "Maximum number of matches to return (default: 50)" }),
  ),
});

type SearchFilesInput = Static<typeof SearchFilesSchema>;

export function createSearchFilesTool(
  defaultCwd: string,
): AgentTool<typeof SearchFilesSchema> {
  return {
    name: "search_files",
    label: "Search Files",
    description:
      "Search file contents for a pattern. Uses grep/ripgrep for fast regex search across files.",
    parameters: SearchFilesSchema,
    async execute(
      _toolCallId: string,
      params: SearchFilesInput,
    ): Promise<AgentToolResult<unknown>> {
      const cwd = params.path || defaultCwd;
      const maxResults = params.maxResults || 50;

      // Try ripgrep first, fall back to grep
      const rgArgs = [
        "--no-heading",
        "--line-number",
        "--color=never",
        `--max-count=${maxResults}`,
      ];
      if (params.glob) {
        rgArgs.push("--glob", params.glob);
      }
      rgArgs.push(params.pattern);

      try {
        const { stdout } = await execFileAsync("rg", rgArgs, {
          cwd,
          timeout: 15_000,
          maxBuffer: 512 * 1024,
          encoding: "utf-8",
        });
        const lines = stdout.trim().split("\n").slice(0, maxResults);
        return {
          content: [
            {
              type: "text",
              text: lines.length > 0 ? lines.join("\n") : "(no matches)",
            },
          ],
          details: {},
        };
      } catch {
        // rg not found or failed, try grep
        try {
          const grepArgs = ["-rn", "--color=never"];
          if (params.glob) {
            grepArgs.push(`--include=${params.glob}`);
          }
          grepArgs.push(params.pattern, ".");
          const { stdout } = await execFileAsync("grep", grepArgs, {
            cwd,
            timeout: 15_000,
            maxBuffer: 512 * 1024,
            encoding: "utf-8",
          });
          const lines = stdout.trim().split("\n").slice(0, maxResults);
          return {
            content: [
              {
                type: "text",
                text: lines.length > 0 ? lines.join("\n") : "(no matches)",
              },
            ],
            details: {},
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // grep returns exit 1 for no matches — that's not an error
          if (msg.includes("exit code 1")) {
            return {
              content: [{ type: "text", text: "(no matches)" }],
              details: {},
            };
          }
          return {
            content: [{ type: "text", text: `search error: ${msg}` }],
            details: {},
          };
        }
      }
    },
  };
}
