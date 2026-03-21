# Clawx Examples

Programmatic usage of clawx as a library.

## Setup

```bash
npm install @halfagiraf/clawx
clawx init  # configure provider, model, and API key
```

Or set environment variables directly:

```bash
export CLAWDEX_PROVIDER=deepseek
export CLAWDEX_BASE_URL=https://api.deepseek.com/v1
export CLAWDEX_MODEL=deepseek-chat
export CLAWDEX_API_KEY=sk-your-key
```

## Examples

| Example | Description |
|---------|-------------|
| [run-task.mjs](run-task.mjs) | Run a single coding task from the command line |
| [multi-turn.mjs](multi-turn.mjs) | Chain multiple prompts with shared context |
| [custom-config.mjs](custom-config.mjs) | Pass config directly without .env files |
| [ci-codegen.mjs](ci-codegen.mjs) | Headless mode for CI/automation pipelines |
| [programmatic-react-express/](programmatic-react-express/) | Full React + Express example app using Clawx programmatically from the backend |

## Run

```bash
# Single task
node examples/run-task.mjs "Create a REST API with Express"

# Multi-turn (builds incrementally)
node examples/multi-turn.mjs

# Custom provider config
DEEPSEEK_API_KEY=sk-... node examples/custom-config.mjs

# CI/headless — returns JSON summary
CLAWDEX_API_KEY=sk-... node examples/ci-codegen.mjs "Generate a Dockerfile for a Node.js app"

# Full React + Express example app
cd examples/programmatic-react-express
npm install
cp .env.example .env
npm run dev
```
