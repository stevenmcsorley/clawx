/**
 * HuggingFace Model Info tool for Scout.
 *
 * Fetches detailed metadata for a specific model, including
 * file sizes (useful for estimating VRAM from GGUF quants).
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";

const HfModelInfoSchema = Type.Object({
  model_id: Type.String({ description: "Full model ID (e.g. 'TheBloke/Mistral-7B-Instruct-v0.2-GGUF', 'Qwen/Qwen2.5-Coder-14B-Instruct')" }),
});

type HfModelInfoInput = Static<typeof HfModelInfoSchema>;

export interface HfModelInfoDetails {
  modelId: string;
  found: boolean;
}

interface HfSibling {
  rfilename: string;
  size?: number;
}

interface HfModelData {
  id: string;
  author?: string;
  downloads: number;
  likes: number;
  lastModified: string;
  tags: string[];
  pipeline_tag?: string;
  library_name?: string;
  siblings?: HfSibling[];
  cardData?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

function formatSize(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)}GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)}MB`;
  return `${(bytes / 1024).toFixed(0)}KB`;
}

export function createHfModelInfoTool(): AgentTool<typeof HfModelInfoSchema, HfModelInfoDetails> {
  return {
    name: "hf_model_info",
    label: "HuggingFace Model Info",
    description:
      "Get detailed info about a specific HuggingFace model. " +
      "Returns tags, file list with sizes (useful for GGUF quant sizing), config, and metadata. " +
      "Use this after hf_search to drill into a promising model.",
    parameters: HfModelInfoSchema,
    async execute(
      _toolCallId: string,
      params: HfModelInfoInput,
    ): Promise<AgentToolResult<HfModelInfoDetails>> {
      const url = `https://huggingface.co/api/models/${params.model_id}`;

      try {
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });

        if (res.status === 404) {
          return {
            content: [{ type: "text", text: `Model "${params.model_id}" not found on HuggingFace.` }],
            details: { modelId: params.model_id, found: false },
          };
        }

        if (!res.ok) {
          return {
            content: [{ type: "text", text: `HuggingFace API error: ${res.status} ${res.statusText}` }],
            details: { modelId: params.model_id, found: false },
          };
        }

        const data = (await res.json()) as HfModelData;

        // Build file listing, highlighting GGUF files with sizes
        const siblings = data.siblings || [];
        const ggufFiles = siblings
          .filter((s) => s.rfilename.endsWith(".gguf"))
          .map((s) => `  ${s.rfilename}${s.size ? ` (${formatSize(s.size)})` : ""}`);

        const otherFiles = siblings
          .filter((s) => !s.rfilename.endsWith(".gguf"))
          .slice(0, 20)
          .map((s) => `  ${s.rfilename}${s.size ? ` (${formatSize(s.size)})` : ""}`);

        const sections: string[] = [
          `Model: ${data.id}`,
          `Author: ${data.author || "?"}`,
          `Downloads: ${data.downloads.toLocaleString()} | Likes: ${data.likes}`,
          `Updated: ${data.lastModified?.slice(0, 10) || "?"}`,
          `Pipeline: ${data.pipeline_tag || "?"}`,
          `Library: ${data.library_name || "?"}`,
          `Tags: ${data.tags?.join(", ") || "none"}`,
        ];

        if (ggufFiles.length > 0) {
          sections.push(`\nGGUF files (${ggufFiles.length}):\n${ggufFiles.join("\n")}`);
        }

        if (otherFiles.length > 0) {
          const totalOther = siblings.filter((s) => !s.rfilename.endsWith(".gguf")).length;
          const suffix = totalOther > 20 ? `\n  ... and ${totalOther - 20} more files` : "";
          sections.push(`\nOther files:\n${otherFiles.join("\n")}${suffix}`);
        }

        if (data.config && Object.keys(data.config).length > 0) {
          const configStr = JSON.stringify(data.config, null, 2).slice(0, 1500);
          sections.push(`\nConfig:\n${configStr}`);
        }

        return {
          content: [{ type: "text", text: sections.join("\n") }],
          details: { modelId: params.model_id, found: true },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `Failed to fetch model info: ${msg}` }],
          details: { modelId: params.model_id, found: false },
        };
      }
    },
  };
}
