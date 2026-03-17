/**
 * HuggingFace README Reader tool for Scout.
 *
 * Fetches and truncates model README/model-card content.
 * Useful for reading benchmark results, quant info, and usage instructions.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";

const HfReadmeSchema = Type.Object({
  model_id: Type.String({ description: "Full model ID (e.g. 'bartowski/Qwen2.5-Coder-14B-Instruct-GGUF')" }),
  max_chars: Type.Optional(Type.Number({ description: "Max characters to return (default: 3000)" })),
});

type HfReadmeInput = Static<typeof HfReadmeSchema>;

export interface HfReadmeDetails {
  modelId: string;
  charCount: number;
  truncated: boolean;
}

export function createHfReadmeTool(): AgentTool<typeof HfReadmeSchema, HfReadmeDetails> {
  return {
    name: "hf_readme",
    label: "HuggingFace README",
    description:
      "Read a model's README/model card from HuggingFace. " +
      "Returns the first ~3000 characters by default. " +
      "Useful for reading benchmark results, quantization details, prompt formats, and usage instructions.",
    parameters: HfReadmeSchema,
    async execute(
      _toolCallId: string,
      params: HfReadmeInput,
    ): Promise<AgentToolResult<HfReadmeDetails>> {
      const maxChars = params.max_chars || 3000;
      const url = `https://huggingface.co/${params.model_id}/raw/main/README.md`;

      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(15_000),
        });

        if (res.status === 404) {
          return {
            content: [{ type: "text", text: `No README found for "${params.model_id}".` }],
            details: { modelId: params.model_id, charCount: 0, truncated: false },
          };
        }

        if (!res.ok) {
          return {
            content: [{ type: "text", text: `Failed to fetch README: ${res.status} ${res.statusText}` }],
            details: { modelId: params.model_id, charCount: 0, truncated: false },
          };
        }

        const fullText = await res.text();
        const truncated = fullText.length > maxChars;
        const text = truncated
          ? fullText.slice(0, maxChars) + `\n\n... [truncated at ${maxChars} chars, full README is ${fullText.length} chars]`
          : fullText;

        return {
          content: [{ type: "text", text: `README for ${params.model_id}:\n\n${text}` }],
          details: {
            modelId: params.model_id,
            charCount: fullText.length,
            truncated,
          },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `Failed to fetch README: ${msg}` }],
          details: { modelId: params.model_id, charCount: 0, truncated: false },
        };
      }
    },
  };
}
