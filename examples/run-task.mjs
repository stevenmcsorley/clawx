#!/usr/bin/env node
/**
 * Run a single coding task and exit.
 *
 * Usage:
 *   node examples/run-task.mjs "Create a hello world Express server"
 *   node examples/run-task.mjs "Add input validation to src/api.ts"
 *
 * Configure via environment variables or ~/.clawx/config (run `clawx init`).
 */

import { loadConfig, runAgent, createStreamRenderer } from "@halfagiraf/clawx";

const prompt = process.argv[2];
if (!prompt) {
  console.error("Usage: node run-task.mjs <prompt>");
  process.exit(1);
}

const config = loadConfig();
const renderer = createStreamRenderer();

console.log(`Model: ${config.model} @ ${config.baseUrl}\n`);

const result = await runAgent(config, {
  prompt,
  onEvent: (event) => renderer.onEvent(event),
});

renderer.finish();
process.exit(result.aborted ? 1 : 0);
