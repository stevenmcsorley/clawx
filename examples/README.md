# Clawx Examples

Small programmatic examples and demo apps built on top of `@halfagiraf/clawx`.

## Setup

```bash
npm install @halfagiraf/clawx
clawx init
```

Or set environment variables directly:

```bash
export CLAWDEX_PROVIDER=deepseek
export CLAWDEX_BASE_URL=https://api.deepseek.com/v1
export CLAWDEX_MODEL=deepseek-chat
export CLAWDEX_API_KEY=sk-your-key
```

## Examples

### Scripts

| Example | Description |
|---------|-------------|
| [run-task.mjs](run-task.mjs) | Single headless task run |
| [multi-turn.mjs](multi-turn.mjs) | Multi-step scripted conversation |
| [custom-config.mjs](custom-config.mjs) | Direct config without local init state |
| [ci-codegen.mjs](ci-codegen.mjs) | CI-friendly headless execution |

### React demo apps

| Example | What it is |
|---------|-------------|
| [programmatic-react-express/](programmatic-react-express/) | Baseline React + Express starter with a simple backend task route |
| [repo-maintainer-app/](repo-maintainer-app/) | Repo maintenance workbench for review, risk spotting, and next-step planning |
| [ops-copilot-app/](ops-copilot-app/) | Lightweight ops dashboard for environment, runtime, and resource inspection |
| [chess-arena-app/](chess-arena-app/) | Browser chess arena with autoplay White vs Black and live controls |
| [detective-app/](detective-app/) | Investigation-themed demo app with a case/clue style workflow |
| [courtroom-app/](courtroom-app/) | Courtroom-themed demo app with a structured argument style experience |
| [dungeon-master-app/](dungeon-master-app/) | Game-master themed demo app for playful interactive sessions |

## Quick run

```bash
node examples/run-task.mjs "Create a REST API with Express"
node examples/multi-turn.mjs
DEEPSEEK_API_KEY=sk-... node examples/custom-config.mjs
CLAWDEX_API_KEY=sk-... node examples/ci-codegen.mjs "Generate a Dockerfile for a Node.js app"

cd examples/programmatic-react-express
npm install
cp .env.example .env
npm run dev
```
