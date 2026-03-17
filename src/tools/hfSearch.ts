/**
 * HuggingFace Model Search tool for Scout.
 *
 * Searches the HuggingFace API for models matching query/filters.
 * No auth required — uses the public API.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";

const HfSearchSchema = Type.Object({
  search: Type.String({ description: "Search query (e.g. 'qwen coder', 'llama uncensored')" }),
  filter: Type.Optional(Type.String({ description: "Comma-separated filters (e.g. 'gguf', 'text-generation', 'text-generation,gguf')" })),
  sort: Type.Optional(Type.String({ description: "Sort by: downloads, likes, lastModified, trending (default: downloads)" })),
  limit: Type.Optional(Type.Number({ description: "Max results to return (default: 10, max: 30)" })),
});

type HfSearchInput = Static<typeof HfSearchSchema>;

export interface HfSearchDetails {
  query: string;
  resultCount: number;
}

interface HfModelEntry {
  id: string;
  downloads: number;
  likes: number;
  lastModified: string;
  tags: string[];
  pipeline_tag?: string;
}

export function createHfSearchTool(): AgentTool<typeof HfSearchSchema, HfSearchDetails> {
  return {
    name: "hf_search",
    label: "HuggingFace Search",
    description:
      "Search HuggingFace for models. Returns model IDs, download counts, likes, tags, and last modified dates. " +
      "Use filters like 'gguf' to find quantized models, 'text-generation' for LLMs. " +
      "Sort by 'downloads' (popular), 'likes' (community favorites), 'lastModified' (newest), or 'trending'.",
    parameters: HfSearchSchema,
    async execute(
      _toolCallId: string,
      params: HfSearchInput,
    ): Promise<AgentToolResult<HfSearchDetails>> {
      const limit = Math.min(params.limit || 10, 30);
      const sort = params.sort || "downloads";

      const url = new URL("https://huggingface.co/api/models");
      url.searchParams.set("search", params.search);
      url.searchParams.set("sort", sort);
      url.searchParams.set("direction", "-1");
      url.searchParams.set("limit", String(limit));

      if (params.filter) {
        for (const f of params.filter.split(",")) {
          url.searchParams.append("filter", f.trim());
        }
      }

      try {
        const res = await fetch(url.toString(), {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
          return {
            content: [{ type: "text", text: `HuggingFace API error: ${res.status} ${res.statusText}` }],
            details: { query: params.search, resultCount: 0 },
          };
        }

        const models = (await res.json()) as HfModelEntry[];

        if (models.length === 0) {
          return {
            content: [{ type: "text", text: `No models found for "${params.search}" with filters: ${params.filter || "none"}` }],
            details: { query: params.search, resultCount: 0 },
          };
        }

        const lines = models.map((m) => {
          const tags = m.tags?.slice(0, 8).join(", ") || "";
          return [
            `- ${m.id}`,
            `  downloads: ${m.downloads.toLocaleString()} | likes: ${m.likes} | updated: ${m.lastModified?.slice(0, 10) || "?"}`,
            `  pipeline: ${m.pipeline_tag || "?"} | tags: ${tags}`,
          ].join("\n");
        });

        const text = `Found ${models.length} models for "${params.search}" (sorted by ${sort}):\n\n${lines.join("\n\n")}`;

        return {
          content: [{ type: "text", text }],
          details: { query: params.search, resultCount: models.length },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `HuggingFace search failed: ${msg}` }],
          details: { query: params.search, resultCount: 0 },
        };
      }
    },
  };
}
