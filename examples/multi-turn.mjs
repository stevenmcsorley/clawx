#!/usr/bin/env node
/**
 * Multi-turn conversation — send a sequence of prompts to the agent,
 * each building on the previous context.
 *
 * Usage:
 *   node examples/multi-turn.mjs
 */

import { loadConfig, runAgent, createStreamRenderer } from "@halfagiraf/clawx";

const config = loadConfig();
const renderer = createStreamRenderer();

const prompts = [
  "Create a file called calc.js with add and subtract functions",
  "Add multiply and divide to calc.js, handle division by zero",
  "Write tests for all four functions in calc.test.js",
];

let messages = [];

for (const prompt of prompts) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`> ${prompt}`);
  console.log("=".repeat(60));

  const result = await runAgent(config, {
    prompt,
    messages,
    onEvent: (event) => renderer.onEvent(event),
  });

  messages = result.messages;
}

renderer.finish();
