# Clawdex

Lean coding/execution agent extracted from [OpenClaw](https://github.com/openclaw/openclaw) core.

Clawdex is a terminal-first agent that can create files, write code, run commands, execute over SSH, and iterate until the job is done. It uses the model's own judgment to decide what to build and how.

## What it does

- **Creates files** — the model decides what files to create and writes them
- **Modifies code** — precise search-and-replace edits in existing files
- **Runs shell commands** — installs deps, builds, tests, verifies
- **Executes over SSH** — scaffolds and manages remote services
- **Iterates** — reads command output, fixes errors, tries again
- **Streams output** — shows progress as the model works

## What it doesn't do

- No chat platform integrations (Telegram, WhatsApp, Discord, etc.)
- No personality/identity systems
- No plugin marketplace
- No approval workflows (permissive by default)
- No gateway/daemon architecture
- No memory/embedding systems

## Quick start

```bash
# Clone and build from source
git clone https://github.com/stevenmcsorley/clawdex.git
cd clawdex
npm install
npm run build

# Configure (see Model Setup below)
cp .env.example .env

# Launch the TUI (rich terminal UI — default mode)
npx clawdex

# Launch TUI with an initial prompt
npx clawdex "Create a Flask app with auth and a SQLite database"

# Single-shot run (headless, exits when done)
npx clawdex run "Create a hello world Express server"

# Basic readline REPL (fallback if TUI has issues)
npx clawdex --basic

# Continue last session
npx clawdex continue
```

## Model setup

Clawdex requires a model that supports **structured tool calling** (returning `tool_calls` in the API response, not just text). This is critical — the agent loop depends on it.

### Model compatibility and benchmarks

Tested on Windows 11, RTX 3060 12GB, 2026-03-15.

| Model | Provider | Tool calling | VRAM | Benchmark | Status |
|-------|----------|-------------|------|-----------|--------|
| **glm-4.7-flash:latest** | Ollama | Structured `tool_calls` | ~5 GB | 12 turns, 13 tool calls — write file + run python | **Recommended** |
| Qwen2.5-Coder-14B-abliterated Q4_K_M | Ollama | Text-only `<tool_call>` tags | ~9 GB | Tool loop never starts — model returns text, not structured calls | Not compatible |
| Qwen2.5-Coder-14B-abliterated Q4_K_M | llama-server `--jinja` | Text-only `<tool_call>` tags | ~9 GB | Same as above | Not compatible |
| GPT-4o / GPT-4-turbo | OpenAI API | Structured `tool_calls` | — | N/A (cloud) | Works |
| Claude 3.5+ | Anthropic API | Structured `tool_calls` | — | N/A (cloud) | Works |

**glm-4.7-flash benchmark detail:**
Task: "Create a file /tmp/hello.py that prints hello world and run it with python"
- Model correctly called `write` to create the file, then `bash` to run it
- Hit a Windows `/tmp` path resolution issue (Python resolved `/tmp` differently than Git Bash)
- Iterated: investigated with `ls`, `which python`, retried with `cat >` via bash
- Completed successfully after 12 turns and 13 tool calls

> **Why Qwen doesn't work:** The abliterated GGUF outputs tool calls as `<tool_call>` text in message content instead of structured `tool_calls` objects in the API response. pi-agent-core requires structured tool calls. This is a model-level issue, not a Clawdex bug.

### Option 1: GLM-4.7-Flash via Ollama (recommended for local)

Requires: [Ollama](https://ollama.com/) installed, ~5GB VRAM.

```bash
# 1. Start the Ollama server (if not already running as a service)
ollama serve
# Ollama listens on http://localhost:11434 by default
# On Windows it often runs as a background service automatically

# 2. Pull the model (~5GB download)
ollama pull glm-4.7-flash:latest

# 3. Verify the model is available
ollama list
# NAME                    SIZE
# glm-4.7-flash:latest    5.2 GB

# 4. (Optional) Test the model is responding
ollama run glm-4.7-flash:latest "hello" --verbose

# 5. Configure .env
cat > .env << 'EOF'
CLAWDEX_PROVIDER=ollama
CLAWDEX_BASE_URL=http://localhost:11434/v1
CLAWDEX_MODEL=glm-4.7-flash:latest
CLAWDEX_API_KEY=not-needed
CLAWDEX_THINKING_LEVEL=off
CLAWDEX_MAX_TOKENS=8192
EOF

# 6. Run Clawdex
npx clawdex run "Create a Python script that prints the first 20 Fibonacci numbers"
```

### Option 2: Qwen2.5-Coder-14B via Ollama (import GGUF)

> **Warning:** This model does NOT produce structured tool calls. It is listed here for reference only. Tool-using agent tasks will fail. You can still use it for plain chat without tools.

If you have the GGUF file locally (e.g. `D:/model/Qwen2.5-Coder-14B-Abliterated/`):

```bash
# 1. Make sure Ollama is running
ollama serve

# 2. Create a Modelfile pointing to your GGUF
# Example Modelfile content:
#   FROM D:/model/Qwen2.5-Coder-14B-Abliterated/Qwen2.5-Coder-14B-Instruct-abliterated-Q4_K_M.gguf
#   TEMPLATE "..." (with Qwen chat + tool call template)
#   PARAMETER stop "<|im_end|>"
#   PARAMETER stop "<|im_start|>"
#   PARAMETER num_ctx 16384
#   PARAMETER temperature 0.7

# 3. Import the GGUF into Ollama
cd D:/model/Qwen2.5-Coder-14B-Abliterated
ollama create qwen-coder-abliterated -f Modelfile
# This copies the GGUF into Ollama's blob store (~8.9GB)

# 4. Verify
ollama list
# NAME                           SIZE
# qwen-coder-abliterated:latest  8.9 GB

# 5. Test it responds (plain chat works fine)
ollama run qwen-coder-abliterated:latest "Write a Python quicksort"

# 6. .env for this model (tool calling won't work)
cat > .env << 'EOF'
CLAWDEX_PROVIDER=ollama
CLAWDEX_BASE_URL=http://localhost:11434/v1
CLAWDEX_MODEL=qwen-coder-abliterated:latest
CLAWDEX_API_KEY=not-needed
CLAWDEX_THINKING_LEVEL=off
CLAWDEX_MAX_TOKENS=8192
EOF
```

### Option 2b: Qwen2.5-Coder-14B via llama-server (llama.cpp)

> **Warning:** Same limitation — text-only tool calls, not compatible with Clawdex agent loop.

If you have llama.cpp built locally (e.g. `D:/llama-cpp/`):

```bash
# 1. Start llama-server with the GGUF (requires --jinja for tool template)
D:/llama-cpp/build/bin/Release/llama-server.exe \
  --model D:/model/Qwen2.5-Coder-14B-Abliterated/Qwen2.5-Coder-14B-Instruct-abliterated-Q4_K_M.gguf \
  --host 0.0.0.0 \
  --port 8080 \
  --n-gpu-layers 99 \
  --ctx-size 16384 \
  --jinja
# Server listens on http://localhost:8080

# 2. Verify it's running
curl http://localhost:8080/v1/models

# 3. .env for llama-server
cat > .env << 'EOF'
CLAWDEX_PROVIDER=local
CLAWDEX_BASE_URL=http://localhost:8080/v1
CLAWDEX_MODEL=qwen2.5-coder-14b-instruct
CLAWDEX_API_KEY=not-needed
CLAWDEX_THINKING_LEVEL=off
CLAWDEX_MAX_TOKENS=8192
EOF
```

### Option 3: OpenAI API

```bash
cat > .env << 'EOF'
CLAWDEX_PROVIDER=openai
CLAWDEX_BASE_URL=https://api.openai.com/v1
CLAWDEX_MODEL=gpt-4o
CLAWDEX_API_KEY=sk-your-key-here
CLAWDEX_THINKING_LEVEL=off
CLAWDEX_MAX_TOKENS=16384
EOF
```

### Option 4: Anthropic API

```bash
cat > .env << 'EOF'
CLAWDEX_PROVIDER=anthropic
CLAWDEX_BASE_URL=https://api.anthropic.com
CLAWDEX_MODEL=claude-sonnet-4-20250514
CLAWDEX_API_KEY=sk-ant-your-key-here
CLAWDEX_THINKING_LEVEL=medium
CLAWDEX_MAX_TOKENS=16384
EOF
```

### GPU / VRAM notes

- **RTX 3060 12GB**: Can run glm-4.7-flash (~5GB) or Qwen-14B Q4_K_M (~9GB), but not both simultaneously
- To free VRAM when switching models: `ollama stop glm-4.7-flash:latest` or `ollama stop qwen-coder-abliterated:latest`
- Ollama auto-loads models on first request and keeps them in VRAM until timeout or manual stop

## Configuration reference

### Environment variables

```bash
CLAWDEX_PROVIDER=ollama                # Provider type (see table below)
CLAWDEX_BASE_URL=http://localhost:11434/v1  # Endpoint URL
CLAWDEX_MODEL=glm-4.7-flash:latest    # Model name
CLAWDEX_API_KEY=not-needed             # API key (if required)
CLAWDEX_WORK_DIR=/path/to/project      # Working directory
CLAWDEX_THINKING_LEVEL=off             # off|minimal|low|medium|high
CLAWDEX_MAX_TOKENS=8192                # Max output tokens
CLAWDEX_EXEC_TIMEOUT=120000            # Tool execution timeout (ms)
```

### Supported providers

| Provider | CLAWDEX_PROVIDER | Notes |
|----------|-----------------|-------|
| Ollama | `ollama` | Recommended for local models |
| llama.cpp | `openai-completions` or `local` | OpenAI-compatible endpoint |
| vLLM | `vllm` | Maps to OpenAI-compatible |
| LM Studio | `lmstudio` | Maps to OpenAI-compatible |
| OpenAI | `openai` | GPT-4o, etc. |
| Anthropic | `anthropic` | Claude models |
| Google | `google` | Gemini models |
| Mistral | `mistral` | Mistral models |

### SSH targets

Define named SSH targets via environment or `clawdex.json`:

```bash
CLAWDEX_SSH_TARGETS='{"pi":{"host":"192.168.1.100","username":"pi","privateKeyPath":"~/.ssh/id_rsa"}}'
```

Or in `clawdex.json`:

```json
{
  "sshTargets": {
    "pi": {
      "host": "192.168.1.100",
      "username": "pi",
      "privateKeyPath": "~/.ssh/id_rsa"
    },
    "server": {
      "host": "myserver.com",
      "port": 2222,
      "username": "deploy",
      "privateKeyPath": "~/.ssh/deploy_key"
    }
  }
}
```

### Config file

Place a `clawdex.json` in your working directory:

```json
{
  "provider": "openai-completions",
  "baseUrl": "http://localhost:8080/v1",
  "model": "qwen2.5-coder-14b-instruct",
  "maxTokens": 16384,
  "thinkingLevel": "medium",
  "systemPrompt": "You specialize in Python backend services."
}
```

## CLI commands

```
clawdex [prompt]         Launch TUI (default mode, rich terminal UI)
clawdex --basic          Launch basic readline REPL instead of TUI
clawdex run <prompt>     Run a task headless and exit
clawdex chat             Interactive basic REPL
clawdex chat -c          Resume last session in basic REPL
clawdex continue         Resume last session
clawdex sessions         List recent sessions
```

### Global options

```
-m, --model <model>        Override model
-p, --provider <provider>  Override provider type
-u, --base-url <url>       Override base URL
-d, --work-dir <dir>       Working directory
-v, --verbose              Debug logging
```

### TUI features (default mode)

The TUI mode uses pi-coding-agent's InteractiveMode:

- Syntax-highlighted code in tool results
- Diff rendering for edit operations
- Spinner animations during tool execution
- Ctrl+P to cycle models
- Ctrl+C to cancel current operation, Ctrl+D to quit
- Session branching and tree navigation
- Markdown rendering in responses
- /slash commands for settings, models, sessions

### Basic REPL commands

```
/clear    Clear session history
/save     Save session
/info     Show session info
/exit     Save and quit
```

## Tools available to the model

| Tool | Source | Description |
|------|--------|-------------|
| `read` | pi-coding-agent | Read file contents |
| `write` | pi-coding-agent | Create/overwrite files |
| `edit` | pi-coding-agent | Precise search-and-replace edits |
| `bash` | pi-coding-agent | Run shell commands |
| `grep` | pi-coding-agent | Search file contents with regex |
| `find` | pi-coding-agent | Find files by pattern |
| `ls` | pi-coding-agent | List directory contents |
| `search_files` | Clawdex | Unified file content search (rg/grep) |
| `git_status` | Clawdex | Git repository status |
| `git_diff` | Clawdex | Git file differences |
| `ssh_run` | Clawdex | Execute commands on SSH targets |

## Architecture

```
src/
  cli/           CLI entry point and REPL
  config/        Configuration loading (.env, JSON)
  core/
    agent.ts     Agent orchestrator (wires pi-agent-core loop)
    provider.ts  Model/provider resolution for local endpoints
    session.ts   JSON-file session persistence
    streaming.ts Terminal output renderer
  tools/
    sshRun.ts    SSH execution (ssh2)
    gitStatus.ts Git status wrapper
    gitDiff.ts   Git diff wrapper
    searchFiles.ts File content search (rg/grep)
  types/         TypeScript type definitions
  utils/         Logger, system prompt builder
```

### Dependencies

- **@mariozechner/pi-agent-core** — Agent loop (user→model→tool→result→loop)
- **@mariozechner/pi-ai** — Provider abstraction, OpenAI-compatible streaming
- **@mariozechner/pi-coding-agent** — Coding tools (read, write, edit, bash, grep, find, ls)
- **ssh2** — SSH client for remote execution
- **commander** — CLI framework
- **chalk** — Terminal colors
- **dotenv** — Environment variable loading
- **zod** — Schema validation (available for extensions)

## Example workflows

### TUI mode (recommended)

```bash
# Launch the full TUI — type prompts interactively
npx clawdex

# Launch with an initial task
npx clawdex "Create a Node.js Express API with JWT auth and SQLite"

# Use a specific model for this session
npx clawdex -m glm-4.7-flash:latest "Build a REST API"
```

### Headless single-shot tasks

```bash
# Create a project and exit
npx clawdex run "Create a Python Flask app with login, SQLite, and unit tests"

# Generate a single file
npx clawdex run "Create a Python script that prints the first 20 Fibonacci numbers"

# Work in a specific directory
npx clawdex run -d ./my-project "Add a health check endpoint to the Express server"
```

The agent will create files, install dependencies, build, and verify — iterating on errors until the task is complete.

### Remote scaffolding via SSH

```bash
# With SSH targets configured in .env or clawdex.json
npx clawdex run "SSH into my Pi and set up a Node.js service that monitors CPU temperature and exposes it as a Prometheus metric on port 9100"
```

### Interactive basic REPL

```bash
# Basic REPL (if TUI doesn't suit your terminal)
npx clawdex --basic

# REPL in a specific project directory
npx clawdex chat -d ./my-project
```

## Programmatic usage

```typescript
import { loadConfig, runAgent, createStreamRenderer } from "clawdex";

const config = loadConfig({
  provider: "openai-completions",
  baseUrl: "http://localhost:8080/v1",
  model: "qwen2.5-coder-14b-instruct",
});

const renderer = createStreamRenderer();
const result = await runAgent(config, {
  prompt: "Create a hello world Express server",
  onEvent: (event) => renderer.onEvent(event),
});
renderer.finish();
```

## License

MIT — extracted and adapted from [OpenClaw](https://github.com/openclaw/openclaw) (MIT).
