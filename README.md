![Clawx](https://raw.githubusercontent.com/stevenmcsorley/clawx/main/logo.png)

# Clawx

[![npm version](https://img.shields.io/npm/v/@halfagiraf/clawx)](https://www.npmjs.com/package/@halfagiraf/clawx) [![license](https://img.shields.io/npm/l/@halfagiraf/clawx)](https://github.com/stevenmcsorley/clawx/blob/main/LICENSE) [![downloads](https://img.shields.io/npm/dm/@halfagiraf/clawx)](https://www.npmjs.com/package/@halfagiraf/clawx)

Terminal-first coding agent — runs locally with Ollama, DeepSeek, OpenAI, or any OpenAI-compatible endpoint.

Clawx started because tools like OpenClaw kept getting heavier. Prompts ballooned, context windows filled up, and local models choked. We wanted the good parts — the tool-calling loop, the terminal UI, the coding tools — without the bloat. So we built something lean on top of the open-source [pi-coding-agent](https://github.com/badlogic/pi-mono) SDK: an agent that runs local models on modest hardware, hits DeepSeek when you need more muscle, and scales up to frontier models when the task calls for it. No token budget wasted on platform overhead. Just the model, the tools, and your prompt.

> **Fair warning:** Clawx runs with the guardrails off. It will create files, delete files, install packages, and execute shell commands — all without asking you first. That's the point. No confirmation dialogs, no "are you sure?", no waiting around. You give it a task, it gets on with it. This makes it ideal for disposable environments, home labs, Raspberry Pis, VMs, and machines you're happy to let rip. If you're pointing it at a production server with your life's work on it... maybe don't do that. Or do.

Clawx can create files, write code, run commands, execute over SSH, and iterate until the job is done. The model decides what to build and how — no file lists, no hand-holding.

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
# Install from npm
npm install -g @halfagiraf/clawx

# Set up your provider and API key
clawx init

# Start coding
clawx
```

Or build from source:

```bash
git clone https://github.com/stevenmcsorley/clawx.git
cd clawx
npm install
npm run build
npm link
```

### Usage

```bash
# Launch TUI (rich terminal UI — default mode)
clawx

# Launch TUI with an initial prompt
clawx "Create a Flask app with auth and a SQLite database"

# Single-shot run (headless, exits when done)
clawx run "Create a hello world Express server"

# Basic readline REPL (fallback if TUI has issues)
clawx --basic

# Continue last session
clawx continue
```

## Model setup

Clawx requires a model that supports **structured tool calling** (returning `tool_calls` in the API response, not just text). This is critical — the agent loop depends on it.

### Model compatibility and benchmarks

Tested on Windows 11, RTX 3060 12GB, 2026-03-15.

| Model | Provider | Tool calling | VRAM | Benchmark | Status |
|-------|----------|-------------|------|-----------|--------|
| **glm-4.7-flash:latest** | Ollama | Structured `tool_calls` | ~5 GB | 12 turns, 13 tool calls — write file + run python | **Recommended local** |
| **Qwen3.5-35B-A3B** (MoE) | Ollama | Structured `tool_calls` | ~12 GB | 35B params, only 3B active per token | **Best local if you have the VRAM** |
| Qwen2.5-Coder-14B-abliterated Q4_K_M | Ollama | Text-only `<tool_call>` tags | ~9 GB | Tool loop never starts — model returns text, not structured calls | Not compatible |
| Qwen2.5-Coder-14B-abliterated Q4_K_M | llama-server `--jinja` | Text-only `<tool_call>` tags | ~9 GB | Same as above | Not compatible |
| GPT-4o / GPT-4-turbo | OpenAI API | Structured `tool_calls` | — | N/A (cloud) | Works |
| **DeepSeek-V3 (deepseek-chat)** | DeepSeek API | Structured `tool_calls` | — | N/A (cloud) | **Works, very cheap** |
| DeepSeek-R1 (deepseek-reasoner) | DeepSeek API | Structured `tool_calls` (via chat) | — | N/A (cloud) | Works |
| Claude 3.5+ | Anthropic API | Structured `tool_calls` | — | N/A (cloud) | Works |

**glm-4.7-flash benchmark detail:**
Task: "Create a file /tmp/hello.py that prints hello world and run it with python"
- Model correctly called `write` to create the file, then `bash` to run it
- Hit a Windows `/tmp` path resolution issue (Python resolved `/tmp` differently than Git Bash)
- Iterated: investigated with `ls`, `which python`, retried with `cat >` via bash
- Completed successfully after 12 turns and 13 tool calls

> **Why Qwen doesn't work:** The abliterated GGUF outputs tool calls as `<tool_call>` text in message content instead of structured `tool_calls` objects in the API response. pi-agent-core requires structured tool calls. This is a model-level issue, not a Clawx bug.

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

# 6. Run Clawx
clawx run "Create a Python script that prints the first 20 Fibonacci numbers"
```

### Option 2: Qwen3.5-35B-A3B via Ollama (MoE — best local)

A 35B Mixture-of-Experts model that only activates 3B parameters per token. Fits in 12GB VRAM and punches well above its weight for coding tasks.

```bash
# 1. Download the GGUF (or use one you already have)
# Example: Qwen3.5-35B-A3B-UD-Q2_K_XL.gguf (~12GB)

# 2. Create a Modelfile
cat > Modelfile-qwen35 << 'EOF'
FROM /path/to/Qwen3.5-35B-A3B-UD-Q2_K_XL.gguf

PARAMETER temperature 0.7
PARAMETER num_ctx 32768
PARAMETER stop <|im_end|>
PARAMETER stop <|endoftext|>

TEMPLATE """{{- if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{- range .Messages }}<|im_start|>{{ .Role }}
{{ .Content }}<|im_end|>
{{ end }}<|im_start|>assistant
"""
EOF

# 3. Import into Ollama
ollama create qwen35-35b -f Modelfile-qwen35

# 4. Configure clawx
clawx init
# Choose: Ollama → model: qwen35-35b

# Or set it directly:
# ~/.clawx/config
# CLAWDEX_PROVIDER=ollama
# CLAWDEX_BASE_URL=http://localhost:11434/v1
# CLAWDEX_MODEL=qwen35-35b
# CLAWDEX_API_KEY=not-needed
# CLAWDEX_MAX_TOKENS=16384
```

### Importing any GGUF into Ollama

Got a GGUF from HuggingFace or elsewhere? Here's how to use it with clawx:

```bash
# 1. Create a Modelfile (adjust the FROM path and template for your model)
cat > Modelfile << 'EOF'
FROM /path/to/your-model.gguf

PARAMETER temperature 0.7
PARAMETER num_ctx 16384
PARAMETER stop <|im_end|>
PARAMETER stop <|endoftext|>

TEMPLATE """{{- if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{- range .Messages }}<|im_start|>{{ .Role }}
{{ .Content }}<|im_end|>
{{ end }}<|im_start|>assistant
"""
EOF

# 2. Import it
ollama create my-model -f Modelfile

# 3. Verify
ollama list

# 4. Use with clawx
clawx run -m my-model -p ollama -u http://localhost:11434/v1 "Your prompt here"
```

> **Note:** The template above uses the ChatML format (`<|im_start|>`/`<|im_end|>`) which works with most Qwen, GLM, and many other models. Check your model's docs if it uses a different chat template (e.g. Llama, Mistral).

### Option 3: Qwen2.5-Coder-14B via Ollama (reference only)

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

### Option 3b: Qwen2.5-Coder-14B via llama-server (llama.cpp)

> **Warning:** Same limitation — text-only tool calls, not compatible with Clawx agent loop.

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

### Option 4: DeepSeek API

DeepSeek is OpenAI-compatible with full structured tool calling support, including thinking mode.
Pricing: ~$0.27/1M input, $1.10/1M output (deepseek-chat). Very cost-effective.

```bash
# 1. Get an API key at https://platform.deepseek.com/
# 2. Configure .env
cat > .env << 'EOF'
CLAWDEX_PROVIDER=deepseek
CLAWDEX_BASE_URL=https://api.deepseek.com/v1
CLAWDEX_MODEL=deepseek-chat
CLAWDEX_API_KEY=sk-your-deepseek-key-here
CLAWDEX_THINKING_LEVEL=off
CLAWDEX_MAX_TOKENS=16384
EOF

# For DeepSeek R1 reasoning model (tool calls route through deepseek-chat):
cat > .env << 'EOF'
CLAWDEX_PROVIDER=deepseek
CLAWDEX_BASE_URL=https://api.deepseek.com/v1
CLAWDEX_MODEL=deepseek-reasoner
CLAWDEX_API_KEY=sk-your-deepseek-key-here
CLAWDEX_THINKING_LEVEL=medium
CLAWDEX_MAX_TOKENS=16384
EOF

# Run
clawx run "Create a FastAPI app with SQLite and JWT auth"
```

### Option 5: OpenAI API

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

### Option 6: Anthropic API

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

- **RTX 3060 12GB**: Can run Qwen3.5-35B-A3B (~12GB), glm-4.7-flash (~5GB), or Qwen-14B (~9GB) — but only one at a time
- **RTX 3070/3080 8GB**: glm-4.7-flash (~5GB) fits comfortably, 14B models are tight
- **RTX 4090 24GB**: Can run most models including full (non-MoE) 30B+ models
- To free VRAM when switching models: `ollama stop <model-name>`
- Ollama auto-loads models on first request and keeps them in VRAM until timeout or manual stop
- Check VRAM usage: `nvidia-smi` (Linux/Windows) or `ollama ps`

## Configuration reference

### Where config lives

Clawx looks for config in this order (first match wins):

| Priority | Location | Created by | Notes |
|----------|----------|------------|-------|
| 1 | `.env` in current directory | You | Per-project overrides |
| 2 | `~/.clawx/config` | `clawx init` | Global config (recommended) |
| 3 | `.env` in package install dir | Dev only | Fallback for development |
| 4 | `clawx.json` in current directory | You | JSON format, supports systemPrompt |
| 5 | Built-in defaults | — | Ollama on localhost |

**Config file paths by OS:**

| OS | Global config | Sessions |
|----|---------------|----------|
| **Windows** | `C:\Users\<you>\.clawx\config` | `C:\Users\<you>\.clawx\sessions\` |
| **Linux** | `~/.clawx/config` | `~/.clawx/sessions/` |
| **macOS** | `~/.clawx/config` | `~/.clawx/sessions/` |

The fastest way to set up is `clawx init` — it writes `~/.clawx/config` for you. To override per-project, drop a `.env` or `clawx.json` in the project directory.

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
| DeepSeek | `deepseek` | OpenAI-compatible, cheap, tool calling + thinking |
| OpenAI | `openai` | GPT-4o, etc. |
| Anthropic | `anthropic` | Claude models |
| Google | `google` | Gemini models |
| Mistral | `mistral` | Mistral models |

### SSH targets

Define named SSH targets via environment or `clawx.json`:

```bash
CLAWDEX_SSH_TARGETS='{"pi":{"host":"192.168.1.100","username":"pi","privateKeyPath":"~/.ssh/id_rsa"}}'
```

Or in `clawx.json`:

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

Place a `clawx.json` in your working directory:

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
clawx init             Set up provider, model, and API key
clawx [prompt]         Launch TUI (default mode, rich terminal UI)
clawx --basic          Launch basic readline REPL instead of TUI
clawx run <prompt>     Run a task headless and exit
clawx chat             Interactive basic REPL
clawx chat -c          Resume last session in basic REPL
clawx continue         Resume last session
clawx sessions         List recent sessions
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
| `search_files` | Clawx | Unified file content search (rg/grep) |
| `git_status` | Clawx | Git repository status |
| `git_diff` | Clawx | Git file differences |
| `ssh_run` | Clawx | Execute commands on SSH targets |

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
clawx

# Launch with an initial task
clawx "Create a Node.js Express API with JWT auth and SQLite"

# Use a specific model for this session
clawx -m glm-4.7-flash:latest "Build a REST API"
```

### Headless single-shot tasks

```bash
# Create a project and exit
clawx run "Create a Python Flask app with login, SQLite, and unit tests"

# Generate a single file
clawx run "Create a Python script that prints the first 20 Fibonacci numbers"

# Work in a specific directory
clawx run -d ./my-project "Add a health check endpoint to the Express server"
```

The agent will create files, install dependencies, build, and verify — iterating on errors until the task is complete.

### Remote scaffolding via SSH

```bash
# With SSH targets configured in .env or clawx.json
clawx run "SSH into my Pi and set up a Node.js service that monitors CPU temperature and exposes it as a Prometheus metric on port 9100"
```

### Interactive basic REPL

```bash
# Basic REPL (if TUI doesn't suit your terminal)
clawx --basic

# REPL in a specific project directory
clawx chat -d ./my-project
```

## Programmatic usage

Use clawx as a library in your own scripts and tools.

**Single task:**

```js
import { loadConfig, runAgent, createStreamRenderer } from "@halfagiraf/clawx";

const config = loadConfig(); // reads from ~/.clawx/config or .env
const renderer = createStreamRenderer();

const result = await runAgent(config, {
  prompt: "Create a hello world Express server",
  onEvent: (event) => renderer.onEvent(event),
});
renderer.finish();
```

**Multi-turn with shared context:**

```js
let messages = [];

for (const prompt of ["Create calc.js with add/subtract", "Add tests"]) {
  const result = await runAgent(config, { prompt, messages,
    onEvent: (event) => renderer.onEvent(event),
  });
  messages = result.messages; // carry context forward
}
```

**Headless for CI/automation:**

```js
const events = [];
const result = await runAgent(config, {
  prompt: "Generate a Dockerfile for this project",
  onEvent: (event) => events.push(event), // collect instead of printing
});
const toolCalls = events.filter(e => e.type === "tool_execution_start");
console.log(`Done: ${toolCalls.length} tool calls, aborted: ${result.aborted}`);
```

See [examples/](examples/) for runnable scripts.

## Troubleshooting

### TUI launches a file manager instead of the coding agent (Linux)

If running `clawx` opens "FD(File & Directory tool)" — a Japanese file manager — instead of the TUI, you have `fdclone` installed which conflicts with the `fd` (sharkdp/fd-find) tool used for autocomplete.

**Fix:**

```bash
sudo apt remove fdclone
```

Next time you run `clawx`, the correct `fd` binary will be downloaded automatically.

### `/models` shows no models

If you set up clawx via `clawx init`, your configured model should appear in `/models`. If it doesn't, check that your `~/.clawx/config` file has the correct `CLAWDEX_PROVIDER`, `CLAWDEX_MODEL`, and `CLAWDEX_API_KEY` values.

## License

MIT. Built on the open-source [pi-coding-agent](https://github.com/badlogic/pi-mono) SDK (MIT).
