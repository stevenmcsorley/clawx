/**
 * Text-based tool call parser.
 *
 * Some models (e.g. Qwen2.5-Coder abliterated) output tool calls as
 * plain text JSON instead of structured tool_calls in the API response.
 * This module wraps the stream function to detect and convert these
 * text-based tool calls into proper ToolCall objects that pi-agent-core
 * can process.
 *
 * Supported patterns:
 * 1. Raw JSON: {"name": "tool_name", "arguments": {...}}
 * 2. Tagged: <tool_call>{"name": "tool_name", "arguments": {...}}</tool_call>
 * 3. Code-fenced JSON with name/arguments structure
 */

import {
  streamSimple,
  type AssistantMessageEventStream,
  type AssistantMessageEvent,
  type AssistantMessage,
  type ToolCall,
  type Context,
  type SimpleStreamOptions,
  type Api,
  type Model,
} from "@mariozechner/pi-ai";
import { createAssistantMessageEventStream } from "@mariozechner/pi-ai";
import { log } from "../utils/logger.js";

/** Common tool name aliases for fuzzy matching */
const TOOL_NAME_MAP: Record<string, string> = {
  write_file: "write",
  read_file: "read",
  edit_file: "edit",
  run_shell: "bash",
  run_command: "bash",
  execute: "bash",
  shell: "bash",
  list_dir: "ls",
  list_directory: "ls",
  search: "grep",
  find_files: "find",
  ssh: "ssh_run",
  ssh_execute: "ssh_run",
};

/**
 * Try to parse a single JSON object as a tool call.
 */
function tryParseOneToolCall(jsonStr: string, tools: string[]): ToolCall | null {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr.trim());
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  if (typeof parsed.name !== "string") return null;
  if (!parsed.arguments || typeof parsed.arguments !== "object") return null;

  let toolName = parsed.name.trim();
  if (!tools.includes(toolName)) {
    const mapped = TOOL_NAME_MAP[toolName];
    if (mapped && tools.includes(mapped)) {
      toolName = mapped;
    } else {
      return null;
    }
  }

  // Sanitize argument keys — models sometimes output "\ncontent" instead of "content"
  const cleanArgs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.arguments)) {
    cleanArgs[key.trim()] = value;
  }

  return {
    type: "toolCall" as const,
    id: `text-tc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: toolName,
    arguments: cleanArgs,
  };
}

/**
 * Extract JSON objects from text by matching balanced braces.
 * Finds top-level {...} blocks that could be tool call JSON.
 */
function extractJsonObjects(text: string): string[] {
  const results: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "{") {
      let depth = 0;
      let inString = false;
      let escape = false;
      const start = i;
      for (let j = i; j < text.length; j++) {
        const ch = text[j];
        if (escape) { escape = false; continue; }
        if (ch === "\\" && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            results.push(text.slice(start, j + 1));
            i = j + 1;
            break;
          }
        }
        if (j === text.length - 1) i = j + 1; // unclosed brace, skip
      }
    } else {
      i++;
    }
  }
  return results;
}

/**
 * Parse text-based tool calls from message content.
 * Returns an array of ToolCalls found (may be empty).
 *
 * Handles:
 * - Single raw JSON: {"name": "write", "arguments": {...}}
 * - Multiple JSON objects in one response (back-to-back or separated by text)
 * - Code-fenced blocks with any language label: ```bash\n{...}\n```
 * - <tool_call> tags: <tool_call>{...}</tool_call>
 * - JSON embedded in explanatory prose
 */
function parseTextToolCalls(text: string, tools: string[]): ToolCall[] {
  const results: ToolCall[] = [];

  // 1. Try <tool_call> tags (may be multiple)
  const tagRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let tagMatch;
  while ((tagMatch = tagRegex.exec(text)) !== null) {
    const tc = tryParseOneToolCall(tagMatch[1], tools);
    if (tc) results.push(tc);
  }
  if (results.length > 0) return results;

  // 2. Try code-fenced blocks with any language label (json, bash, etc.)
  const fenceRegex = /```\w*\s*\n?([\s\S]*?)\n?\s*```/g;
  let fenceMatch;
  while ((fenceMatch = fenceRegex.exec(text)) !== null) {
    const tc = tryParseOneToolCall(fenceMatch[1], tools);
    if (tc) results.push(tc);
  }
  if (results.length > 0) return results;

  // 3. Find all JSON objects in the text (handles back-to-back, embedded in prose, etc.)
  const jsonBlocks = extractJsonObjects(text);
  for (const block of jsonBlocks) {
    const tc = tryParseOneToolCall(block, tools);
    if (tc) results.push(tc);
  }

  return results;
}

/**
 * Create a stream function wrapper that intercepts text-based tool calls
 * and converts them to structured ToolCall objects.
 */
export function createToolParsingStreamFn(toolNames: string[]) {
  return function toolParsingStreamFn<TApi extends Api>(
    model: Model<TApi>,
    context: Context,
    options?: SimpleStreamOptions,
  ): AssistantMessageEventStream {
    const outputStream = createAssistantMessageEventStream();
    const innerStream = streamSimple(model, context, options);

    // Skip parsing entirely in chat mode (no tools in context)
    const hasTools = context.tools && context.tools.length > 0;

    void (async () => {
      try {
        let finalEvent: AssistantMessageEvent | null = null;

        for await (const event of innerStream) {
          if (event.type === "done") {
            finalEvent = event;

            // In chat mode, pass through without parsing
            if (!hasTools) {
              outputStream.push(event);
              continue;
            }

            // Check if the text content looks like a tool call
            const message = event.message;
            const textContent = message.content
              .filter((c): c is { type: "text"; text: string } => c.type === "text")
              .map((c) => c.text)
              .join("");

            const hasToolCalls = message.content.some((c) => c.type === "toolCall");

            if (!hasToolCalls && textContent.trim()) {
              const toolCalls = parseTextToolCalls(textContent, toolNames);
              if (toolCalls.length > 0) {
                // Only take the first tool call — the loop will iterate for more
                const toolCall = toolCalls[0];
                log.info(`Parsed text tool call: ${toolCall.name}(${JSON.stringify(toolCall.arguments).slice(0, 100)})`);

                // Build a new message with the tool call instead of text
                const newContent = [
                  ...message.content.filter((c) => c.type !== "text"),
                  toolCall,
                ];
                const newMessage: AssistantMessage = {
                  ...message,
                  content: newContent,
                  stopReason: "toolUse",
                };

                // Emit toolcall events
                const tcIndex = newContent.indexOf(toolCall);
                outputStream.push({
                  type: "toolcall_start",
                  contentIndex: tcIndex,
                  partial: newMessage,
                });
                outputStream.push({
                  type: "toolcall_end",
                  contentIndex: tcIndex,
                  toolCall,
                  partial: newMessage,
                });
                outputStream.push({
                  type: "done",
                  reason: "toolUse",
                  message: newMessage,
                });
                continue;
              }
            }

            // No tool call found — pass through as-is
            outputStream.push(event);
          } else if (event.type === "error") {
            outputStream.push(event);
          } else {
            // Pass through all other events (start, text_delta, etc.)
            outputStream.push(event);
          }
        }
      } catch (err) {
        // If something goes wrong, emit an error
        outputStream.push({
          type: "error",
          reason: "error",
          error: {
            role: "assistant",
            content: [{ type: "text", text: "" }],
            api: "openai-completions" as Api,
            provider: model.provider,
            model: model.id,
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
            stopReason: "error",
            errorMessage: err instanceof Error ? err.message : String(err),
            timestamp: Date.now(),
          },
        });
      }
    })();

    return outputStream;
  };
}
