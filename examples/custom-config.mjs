#!/usr/bin/env node
/**
 * Use clawx with explicit configuration — no .env or config file needed.
 *
 * Usage:
 *   node examples/custom-config.mjs
 */

import { loadConfig, runAgent, createStreamRenderer } from "@halfagiraf/clawx";

// Override any config values directly
const config = loadConfig({
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  apiKey: process.env.DEEPSEEK_API_KEY || "sk-your-key-here",
  maxTokens: 8192,
  workDir: process.cwd(),
});

const renderer = createStreamRenderer();

const result = await runAgent(config, {
  prompt: "List the files in the current directory and summarize what this project does",
  onEvent: (event) => renderer.onEvent(event),
});

renderer.finish();
