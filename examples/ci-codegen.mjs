#!/usr/bin/env node
/**
 * CI/automation example — run clawx as part of a build pipeline.
 *
 * Generates code, checks the result, and exits with appropriate status.
 * Useful for automated scaffolding, migrations, or code generation tasks.
 *
 * Usage:
 *   CLAWDEX_API_KEY=sk-... node examples/ci-codegen.mjs
 */

import { loadConfig, runAgent } from "@halfagiraf/clawx";

const config = loadConfig();

// Quiet mode — collect output without streaming to terminal
const events = [];

const result = await runAgent(config, {
  prompt: process.argv[2] || "Create a minimal package.json for a TypeScript project called my-app",
  onEvent: (event) => events.push(event),
});

// Extract what the agent did
const toolCalls = events.filter((e) => e.type === "tool_execution_start");
const errors = events.filter((e) => e.type === "tool_execution_end" && e.isError);

console.log(JSON.stringify({
  success: !result.aborted && errors.length === 0,
  turns: events.filter((e) => e.type === "turn_start").length,
  toolCalls: toolCalls.map((e) => e.toolName),
  errors: errors.length,
  messageCount: result.messages.length,
}, null, 2));

process.exit(result.aborted || errors.length > 0 ? 1 : 0);
