/**
 * HuggingFace Dataset Search tool for Forge.
 *
 * Searches the HuggingFace API for datasets matching query.
 * No auth required — uses the public API.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";

const HfDatasetSearchSchema = Type.Object({
  search: Type.String({ description: "Search query (e.g. 'medical text', 'images classification')" }),
  limit: Type.Optional(Type.Number({ description: "Max results to return (default: 10, max: 30)" })),
});

type HfDatasetSearchInput = Static<typeof HfDatasetSearchSchema>;

export interface HfDatasetSearchDetails {
  query: string;
  resultCount: number;
}

interface HfDatasetEntry {
  id: string;
  downloads: number;
  likes: number;
  lastModified: string;
  tags: string[];
  description?: string;
  size?: number;
  language?: string[];
  task_categories?: string[];
}

export function createHfDatasetSearchTool(): AgentTool<typeof HfDatasetSearchSchema, HfDatasetSearchDetails> {
  return {
    name: "hf_dataset_search",
    label: "HuggingFace Dataset Search",
    description:
      "Search HuggingFace for datasets. Returns dataset IDs, download counts, likes, tags, and descriptions. " +
      "Useful for finding training data or evaluation datasets.",
    parameters: HfDatasetSearchSchema,
    async execute(
      _toolCallId: string,
      params: HfDatasetSearchInput,
    ): Promise<AgentToolResult<HfDatasetSearchDetails>> {
      const limit = Math.min(params.limit || 10, 30);

      const url = new URL("https://huggingface.co/api/datasets");
      url.searchParams.set("search", params.search);
      url.searchParams.set("limit", limit.toString());
      url.searchParams.set("sort", "downloads"); // Most popular first

      try {
        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(`HF API error: ${response.status} ${response.statusText}`);
        }

        const datasets = await response.json() as HfDatasetEntry[];

        // Format results for display
        const formattedResults = datasets.map((dataset) => {
          const desc = dataset.description 
            ? (dataset.description.length > 100 
                ? dataset.description.substring(0, 100) + "..." 
                : dataset.description)
            : "No description";
          
          const tags = dataset.tags.slice(0, 5).join(", ");
          const languages = dataset.language ? dataset.language.slice(0, 3).join(", ") : "N/A";
          
          return {
            id: dataset.id,
            downloads: dataset.downloads.toLocaleString(),
            likes: dataset.likes.toLocaleString(),
            lastModified: new Date(dataset.lastModified).toLocaleDateString(),
            description: desc,
            tags: tags,
            languages: languages,
            size: dataset.size ? `${dataset.size.toLocaleString()} samples` : "Unknown",
          };
        });

        const text = `Found ${datasets.length} datasets for "${params.search}":\n\n` +
          formattedResults.map((d, i) => 
            `${i + 1}. ${d.id}\n` +
            `   📥 ${d.downloads} downloads | 👍 ${d.likes} likes\n` +
            `   📝 ${d.description}\n` +
            `   🏷️  ${d.tags}\n` +
            `   🌐 ${d.languages} | 📊 ${d.size}\n` +
            `   📅 Last updated: ${d.lastModified}\n`
          ).join("\n");

        return {
          content: [{ type: "text", text }],
          details: {
            query: params.search,
            resultCount: datasets.length,
          },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to search datasets: ${error instanceof Error ? error.message : String(error)}` }],
          details: {
            query: params.search,
            resultCount: 0,
          },
        };
      }
    },
  };
}