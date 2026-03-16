/**
 * Terminal streaming renderer for Clawx.
 *
 * EXTRACTION NOTE:
 * OpenClaw's streaming (pi-embedded-subscribe.ts, 726 lines) handles:
 * - Thinking/reasoning tag stripping with code-span awareness
 * - Block chunking for channel message size limits
 * - Messaging tool duplicate detection
 * - Compaction retry coordination
 * - Multi-level buffering with partial block state
 * - Channel-aware formatting (markdown vs plain)
 *
 * We DISCARD all of that. For terminal output, we render agent events directly:
 * - Stream text deltas as they arrive
 * - Show tool calls with their names and a spinner
 * - Show tool results
 * - Show errors
 *
 * Clean, simple, terminal-native.
 */

import chalk from "chalk";
import type { AgentEvent } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, ToolCall, TextContent, ThinkingContent } from "@mariozechner/pi-ai";

export interface StreamRenderer {
  onEvent(event: AgentEvent): void;
  finish(): void;
}

export function createStreamRenderer(): StreamRenderer {
  let currentToolName: string | null = null;
  let toolCallCount = 0;
  let turnCount = 0;

  return {
    onEvent(event: AgentEvent) {
      switch (event.type) {
        case "agent_start":
          break;

        case "turn_start":
          turnCount++;
          break;

        case "message_start":
          if (event.message.role === "assistant") {
            // New assistant response starting
          }
          break;

        case "message_update": {
          const evt = event.assistantMessageEvent;
          if (evt.type === "text_delta") {
            process.stdout.write(evt.delta);
          } else if (evt.type === "thinking_delta") {
            // Show thinking in dim if present
            process.stderr.write(chalk.dim(evt.delta));
          }
          break;
        }

        case "message_end": {
          const msg = event.message;
          if (msg.role === "assistant") {
            const assistant = msg as AssistantMessage;
            // Ensure newline after streamed text
            const hasText = assistant.content.some(
              (c): c is TextContent => c.type === "text" && c.text.trim().length > 0,
            );
            if (hasText) {
              process.stdout.write("\n");
            }

            // Show stop reason if not normal
            if (assistant.stopReason === "error") {
              console.error(
                chalk.red(`\n[error] ${assistant.errorMessage || "Unknown error"}`),
              );
            } else if (assistant.stopReason === "length") {
              console.error(chalk.yellow("\n[truncated — max tokens reached]"));
            }
          }
          break;
        }

        case "tool_execution_start": {
          currentToolName = event.toolName;
          toolCallCount++;
          const argsPreview = formatToolArgs(event.args);
          process.stderr.write(
            chalk.cyan(`\n[tool] ${event.toolName}`) +
              chalk.gray(` ${argsPreview}\n`),
          );
          break;
        }

        case "tool_execution_update":
          // Could show progress, but most tools are fast
          break;

        case "tool_execution_end": {
          currentToolName = null;
          const isErr = event.isError;
          const resultText = extractResultText(event.result);
          const truncated =
            resultText.length > 500
              ? resultText.slice(0, 500) + "... (truncated)"
              : resultText;

          if (isErr) {
            process.stderr.write(chalk.red(`  [error] ${truncated}\n`));
          } else {
            process.stderr.write(chalk.gray(`  ${truncated}\n`));
          }
          break;
        }

        case "turn_end":
          break;

        case "agent_end":
          break;
      }
    },

    finish() {
      if (toolCallCount > 0) {
        process.stderr.write(
          chalk.gray(`\n[done] ${turnCount} turns, ${toolCallCount} tool calls\n`),
        );
      }
    },
  };
}

function formatToolArgs(args: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.length > 80) {
      parts.push(`${key}="${value.slice(0, 80)}..."`);
    } else if (typeof value === "string") {
      parts.push(`${key}="${value}"`);
    } else {
      parts.push(`${key}=${JSON.stringify(value)}`);
    }
  }
  return parts.join(" ");
}

function extractResultText(result: unknown): string {
  if (!result || typeof result !== "object") return String(result);
  const r = result as { content?: Array<{ type: string; text?: string }> };
  if (Array.isArray(r.content)) {
    return r.content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!)
      .join("\n");
  }
  return JSON.stringify(result).slice(0, 200);
}
