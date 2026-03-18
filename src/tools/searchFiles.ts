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
import { 
  getPlatformSearchCapabilities, 
  executeRipgrep, 
  executeGrep,
  searchFilesNode 
} from "../utils/search-utils.js";

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
      "Search file contents for a pattern. Uses ripgrep/grep if available, falls back to Node.js search.",
    parameters: SearchFilesSchema,
    async execute(
      _toolCallId: string,
      params: SearchFilesInput,
    ): Promise<AgentToolResult<unknown>> {
      const cwd = params.path || defaultCwd;
      const maxResults = params.maxResults || 50;
      
      // Check platform capabilities
      const capabilities = getPlatformSearchCapabilities();
      
      let resultText = "";
      let searchMethod = "node";
      
      try {
        if (capabilities.recommendedTool === 'ripgrep') {
          searchMethod = 'ripgrep';
          const result = await executeRipgrep(params.pattern, cwd, params.glob, maxResults);
          if (result.success) {
            resultText = result.output || "(no matches)";
          } else {
            // Fall back to grep
            searchMethod = 'grep-fallback';
            const grepResult = await executeGrep(params.pattern, cwd, params.glob, maxResults);
            resultText = grepResult.success ? grepResult.output || "(no matches)" : `rg failed: ${result.error}`;
          }
        } else if (capabilities.recommendedTool === 'grep') {
          searchMethod = 'grep';
          const result = await executeGrep(params.pattern, cwd, params.glob, maxResults);
          resultText = result.success ? result.output || "(no matches)" : `grep failed: ${result.error}`;
        } else {
          // Use Node.js fallback
          searchMethod = 'node';
          const results = searchFilesNode(params.pattern, cwd, params.glob, maxResults);
          resultText = results.length > 0 ? results.join("\n") : "(no matches)";
        }
        
        // Limit output lines
        const lines = resultText.split("\n").slice(0, maxResults);
        const finalText = lines.length > 0 ? lines.join("\n") : "(no matches)";
        
        return {
          content: [
            {
              type: "text",
              text: finalText,
            },
          ],
          details: {
            searchMethod,
            capabilities,
            maxResults,
            pattern: params.pattern,
          },
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `search error: ${msg}` }],
          details: { error: msg, searchMethod },
        };
      }
    },
  };
}
