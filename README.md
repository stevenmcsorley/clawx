![Clawx](https://raw.githubusercontent.com/stevenmcsorley/clawx/main/logo.png)

# Clawx

[![npm version](https://img.shields.io/npm/v/@halfagiraf/clawx)](https://www.npmjs.com/package/@halfagiraf/clawx) [![license](https://img.shields.io/npm/l/@halfagiraf/clawx)](https://github.com/stevenmcsorley/clawx/blob/main/LICENSE) [![downloads](https://img.shields.io/npm/dm/@halfagiraf/clawx)](https://www.npmjs.com/package/@halfagiraf/clawx)

Terminal-first coding agent — runs locally with Ollama, DeepSeek, OpenAI, or any OpenAI-compatible endpoint.

> **Always update before use — this project is in active development and can change by the hour:**
> ```bash
> npm install -g @halfagiraf/clawx@latest
> ```

> **Beta** — Clawx is under active development. It works well with the providers we've tested (Ollama, DeepSeek, OpenAI, Anthropic) but not every combination has been battle-tested yet. If you hit a bug, [open an issue](https://github.com/stevenmcsorley/clawx/issues) — we fix things fast.

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
- **Falls back to chat** — models without tool support switch to chat mode automatically
- **Scouts for models** — built-in HuggingFace researcher finds GGUF models that fit your hardware

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

# Use a specific model/provider without switching profile
clawx --model qwen2.5-coder:7b-instruct --provider ollama
clawx --model deepseek-chat --provider deepseek

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
| **Qwen2.5-Coder-14B-abliterated Q4_K_M** | Ollama | Text-based (auto-parsed) | ~9 GB | Text tool parser converts JSON output to structured calls | **Works (with parser)** |
| Qwen2.5-Coder-14B-abliterated Q4_K_M | llama-server `--jinja` | Text-based (auto-parsed) | ~9 GB | Same parser support | Works (with parser) |
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

> **Qwen text tool parser:** The abliterated GGUF outputs tool calls as JSON text instead of structured `tool_calls` objects. Clawx automatically detects and parses these text-based tool calls, converting them to proper structured calls. It also fuzzy-matches tool names (e.g. `write_file` → `write`, `run_shell` → `bash`). This is enabled by default in `clawx run` and the REPL.

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

### Option 3: Qwen2.5-Coder-14B via Ollama

> **Note:** This model outputs tool calls as plain text JSON instead of structured `tool_calls`. Clawx's built-in text tool parser automatically detects and converts these, so it works in agent mode. See the compatibility table above — status is **"Works (with parser)"**.

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

# 6. .env for this model
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

> **Note:** Same as Option 3 — text-based tool calls are automatically parsed by Clawx.

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
| 5 | `~/.clawx/clawx.json` | You | Global JSON config (SSH targets, etc.) |
| 6 | Built-in defaults | — | Ollama on localhost |

**Config file paths by OS:**

| OS | Global config | Sessions |
|----|---------------|----------|
| **Windows** | `C:\Users\<you>\.clawx\config` | `C:\Users\<you>\.clawx\sessions\` |
| **Linux** | `~/.clawx/config` | `~/.clawx/sessions/` |
| **macOS** | `~/.clawx/config` | `~/.clawx/sessions/` |

The fastest way to set up is `clawx init` — it writes `~/.clawx/config` for you. To override per-project, drop a `.env` or `clawx.json` in the project directory.

**Global SSH targets:** Place a `clawx.json` in `~/.clawx/` to make SSH targets available from any directory. Local `clawx.json` targets override global ones with the same name.

### Profiles — switch models instantly

Set up multiple providers and models once, then switch between them without re-entering API keys or editing config files.

```bash
# Set up DeepSeek (clawx init auto-saves a profile)
clawx init
# → Pick deepseek, enter API key
# → Profile "deepseek-chat" saved automatically

# Set up a local model
clawx init
# → Pick ollama, enter model name
# → Profile "glm-4.7-flash-latest" saved automatically

# Or save the current config under a custom name
clawx add deepseek
clawx add local-qwen

# Switch instantly — no reconfiguration
clawx use deepseek        # API key already stored
clawx use local-qwen      # back to local model

# See all your profiles
clawx profiles
#   deepseek             deepseek-chat via deepseek ← active
#   local-qwen           qwen35-35b via ollama
#   glm-4.7-flash-latest glm-4.7-flash:latest via ollama

# Remove a profile you don't need
clawx remove local-qwen
```

Profiles are stored in `~/.clawx/profiles/`. Each is a standalone config file — switch as often as you like, your API keys and settings are always there.

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

Clawx has a dedicated `ssh_run` tool — the model calls it by target name, no raw SSH needed. Define targets in `clawx.json`:

**Global (works from any directory):** `~/.clawx/clawx.json`

**Per-project (overrides global):** `./clawx.json` in your working directory

```json
{
  "sshTargets": {
    "pi": {
      "host": "192.168.1.198",
      "username": "dev",
      "privateKeyPath": "~/.ssh/id_ed25519"
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

Or via environment variable:

```bash
CLAWDEX_SSH_TARGETS='{"pi":{"host":"192.168.1.198","username":"dev","privateKeyPath":"~/.ssh/id_ed25519"}}'
```

**Quick setup:**

```bash
# Create global config dir (if it doesn't exist)
mkdir -p ~/.clawx

# Create global SSH targets
cat > ~/.clawx/clawx.json << 'EOF'
{
  "sshTargets": {
    "pi": {
      "host": "192.168.1.198",
      "username": "dev",
      "privateKeyPath": "~/.ssh/id_ed25519"
    }
  }
}
EOF

# Now SSH works from any directory
clawx run "SSH into the pi and check what's running"
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
clawx chat             Interactive chat (no tools — works with any model)
clawx chat -c          Resume last session in chat mode
clawx continue         Resume last session
clawx sessions         List recent sessions
clawx scout            AI-powered HuggingFace model researcher
clawx scout --setup-hardware  Re-prompt hardware specs manually
clawx profiles         List saved profiles
clawx add <name>       Save current config as a named profile
clawx use <name>       Switch to a saved profile
clawx remove <name>    Delete a saved profile
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
- `/chat` to toggle between **agent mode** (tools enabled) and **chat mode** (no tools)

### Agent mode vs chat mode

Clawx runs in two modes, shown in the TUI footer:

| Mode | Tools | System prompt | When |
|------|-------|---------------|------|
| **Agent mode** | All tools active (read, write, bash, ssh, etc.) | Coding agent — action-oriented, creates files, runs commands | Default for models that support tool calling |
| **Chat mode** | No tools | Conversational assistant — discusses code, explains concepts | Models without tool support, or toggled with `/chat` |

**Auto-detection:** If your model doesn't support tool calling (e.g. `glm47-uncensored`), Clawx detects this and switches to chat mode automatically — no crash, no error. You can still have a conversation.

**Manual toggle:** Type `/chat` in the TUI to switch modes at any time. Useful when you want to discuss an approach before the agent starts executing, or when using a model that works better without tools.

**On model switch:** When you change model (Ctrl+P), Clawx restores agent mode so the new model gets a fresh start with tools.

`clawx chat` (the CLI command) always starts in chat mode — it never sends tools, so it works with every model regardless of tool support.

### Scout — HuggingFace Model Researcher

Scout is an AI-powered model researcher that searches HuggingFace for GGUF models that fit your hardware. It auto-detects your GPU, VRAM, and RAM, then launches an interactive session where the agent can search, inspect, and recommend models.

> **Windows only for now.** Hardware auto-detection uses `nvidia-smi` and `wmic` which are Windows-native. Linux/macOS support is partially implemented (nvidia-smi works on Linux, macOS uses system_profiler) but hasn't been tested yet.

```bash
# First run — auto-detects hardware, saves to ~/.clawx/hardware.json
clawx scout

# Re-prompt hardware specs manually (with auto-detected defaults)
clawx scout --setup-hardware

# Use a specific model for the scout agent
clawx scout -m deepseek-chat -p deepseek
```

On first run, Scout detects your system and auto-sends a starter message with your hardware specs. The agent immediately starts researching:

```
  ╔═╗╦  ╔═╗╦ ╦═╗╔═
  ║  ║  ╠═╣║║║ ╚╝
  ╚═╝╩═╝╩ ╩╚╩╝═╝╚═
  v0.2.1  ·  deepseek-chat via deepseek
  ────────────────────────────────────────

  Mode: Scout (HuggingFace Model Researcher)

> My hardware: NVIDIA GeForce RTX 3060, 12GB VRAM, 64GB RAM,
  Windows 10. What models would you recommend for local coding
  assistance with tool calling support?
```

The agent uses three HuggingFace tools to research models:

- **hf_search** — searches HuggingFace by query, filters (gguf, text-generation), and sort order
- **hf_model_info** — gets detailed metadata including GGUF file sizes for VRAM estimation
- **hf_readme** — reads model cards for benchmarks, prompt formats, and quant details

Here's an excerpt from a real session. The agent searched for coding models, checked file sizes, read model cards, then delivered recommendations tailored to the user's 12GB VRAM:

```
 hf_search { "search": "coder gguf", "filter": "gguf,text-generation", "sort": "downloads", "limit": 15 }

 Found 15 models for "coder gguf" (sorted by downloads):
 - unsloth/Qwen3-Coder-Next-GGUF           481,295 downloads
 - ggml-org/Qwen3-Coder-30B-A3B-Instruct   176,570 downloads
 - Qwen/Qwen2.5-Coder-32B-Instruct-GGUF    166,480 downloads
 - bartowski/Qwen2.5-Coder-7B-Instruct-GGUF 104,034 downloads
 ...

 hf_model_info { "model_id": "unsloth/Qwen3-Coder-Next-GGUF" }
 hf_readme { "model_id": "unsloth/Qwen3-Coder-Next-GGUF" }

 Recommended Models for Coding + Tool Calling:

 1. Qwen3-Coder-Next (80B total, 3B activated) — BEST OVERALL
    VRAM: ~4-8GB depending on quant | 256K context | Tool calling supported
    Why: Specifically designed for coding agents, Feb 19 update improved tool-calling

 2. Qwen2.5-Coder-7B-Instruct — BALANCED PERFORMANCE
    VRAM: Q5_K_M ~5GB, Q8_0 ~7.5GB | 104K+ downloads
    Why: Proven, reliable, good quality/size balance

 3. LFM2.5-1.2B-Nova-Function-Calling — SPECIALIZED TOOL CALLING
    VRAM: ~0.7-1.2GB | 97% syntax reliability for JSON
    Why: Tiny but specifically fine-tuned for function calling

 Would you like me to check specific file sizes or help create
 an Ollama Modelfile for your chosen model?
```

Ask it to create a Modelfile and it does the rest — inspects the model's GGUF files, reads the README for the prompt format, and generates a complete Ollama setup:

```
> Yes, create an Ollama Modelfile for NovachronoAI/LFM2.5-1.2B-Nova-Function-Calling-GGUF

 hf_model_info { "model_id": "NovachronoAI/LFM2.5-1.2B-Nova-Function-Calling-GGUF" }

 GGUF files (6):
   LFM2.5-1.2B-Nova-Function-Calling.Q2_K.gguf
   LFM2.5-1.2B-Nova-Function-Calling.Q4_K_M.gguf
   LFM2.5-1.2B-Nova-Function-Calling.Q8_0.gguf
   ...

 hf_readme { "model_id": "NovachronoAI/LFM2.5-1.2B-Nova-Function-Calling-GGUF" }

 ChatML Native: Uses the standard <|im_start|> format
 JSON Reliability: 97% syntax accuracy
 Expected output: <tool_call>{"name": "...", "arguments": {...}}</tool_call>

 [writes Modelfile]
 FROM ./LFM2.5-1.2B-Nova-Function-Calling.Q4_K_M.gguf
 TEMPLATE """<|im_start|>system
 {{ .System }}<|im_end|>
 {{ range .Messages }}<|im_start|>{{ .Role }}
 {{ .Content }}<|im_end|>
 {{ end }}<|im_start|>assistant
 """
 PARAMETER temperature 0.1
 PARAMETER num_ctx 4096
 PARAMETER stop <|im_end|>
 PARAMETER stop <|im_start|>

 [writes download_model.ps1]   — PowerShell script to download the GGUF
 [writes test_function_calling.py] — Python test script to verify it works

 Quick Start:
   .\download_model.ps1
   ollama create lfm-nova -f Modelfile
   ollama run lfm-nova "Calculate area of circle with radius 5"

 Expected VRAM: ~0.8GB — plenty of room on your 12GB RTX 3060
```

Scout uses the same model/provider flags as the main TUI. You can run it with a local model (`-m qwen2.5-coder:7b-instruct -p ollama`) or a cloud API (`-p deepseek`). The text tool parser works in scout mode too, so models that output tool calls as text (like Qwen) will still work.

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
  cli/
    main.ts        CLI entry point (Commander.js commands)
    tui.ts         TUI mode (pi-coding-agent InteractiveMode)
    scout.ts       Scout mode (HuggingFace model researcher)
    repl.ts        Basic readline REPL fallback
    banner.ts      Startup banner and version
  config/
    index.ts       Configuration loading (.env, JSON)
    hardware.ts    Hardware spec detection and management
  core/
    agent.ts       Agent orchestrator (wires pi-agent-core loop)
    provider.ts    Model/provider resolution for local endpoints
    session.ts     JSON-file session persistence
    streaming.ts   Terminal output renderer
    text-tool-parser.ts  Text-based tool call parser (Qwen, etc.)
  extensions/
    chat-mode.ts   TUI extension: /chat toggle, auto-detection, prompt swap
  tools/
    sshRun.ts      SSH execution (ssh2)
    gitStatus.ts   Git status wrapper
    gitDiff.ts     Git diff wrapper
    searchFiles.ts File content search (rg/grep)
    hfSearch.ts    HuggingFace model search (Scout)
    hfModelInfo.ts HuggingFace model details (Scout)
    hfReadme.ts    HuggingFace README reader (Scout)
  types/           TypeScript type definitions
  utils/
    system-prompt.ts  System prompt builder
    scout-prompt.ts   Scout system prompt builder
    logger.ts         Structured logger
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

Clawx can SSH into other machines on your network and run commands — from installing packages to deploying services. You describe what you want on your desktop; it happens on the remote machine.

**1. Configure an SSH target** in `~/.clawx/clawx.json` (global) or `./clawx.json` (per-project):

```json
{
  "sshTargets": {
    "pi": {
      "host": "192.168.1.198",
      "username": "dev",
      "privateKeyPath": "~/.ssh/id_ed25519"
    }
  }
}
```

**2. Run a prompt that references the target:**

```bash
clawx run "SSH into the pi and run: hostname && uname -a"
```

**3. Clawx connects and executes:**

```
[tool] ssh_run target="pi" command="hostname && uname -a"
  [pi] exit=0 (943ms)
ubuntu
Linux ubuntu 6.14.0-1019-raspi aarch64 GNU/Linux
```

Tested and verified with DeepSeek API → Raspberry Pi 4 (Ubuntu aarch64) over local network.

**More SSH examples:**

```bash
# Install and start a service on a remote Pi
clawx run "SSH into the pi, install Node.js, create an Express API with a /hello endpoint, start it on port 3000, and verify it's running with curl"

# Set up monitoring
clawx run "SSH into the pi and set up a Node.js service that monitors CPU temperature and exposes it as a Prometheus metric on port 9100"

# Deploy to a server
clawx run "SSH into server, pull the latest code from git, run npm install, and restart the PM2 process"
```

You can define multiple targets (pi, server, vm, etc.) and reference them by name in your prompts.

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

### Model doesn't support tool calling

If the TUI shows "does not support tool calling" or you see a 400 error about tools, your model doesn't support structured tool calls. Clawx handles this gracefully:

- **TUI mode** (`clawx`): automatically switches to **chat mode** — you can still have a conversation, just without file/command tools. Type `/chat` to toggle back if you switch to a different model.
- **Chat mode** (`clawx chat`): always works — never sends tools, compatible with every model.
- **Run mode** (`clawx run`): will show an error and suggest alternatives.

To use the full agent loop (file creation, command execution, SSH), switch to a model that supports structured tool calls — see the [model compatibility table](#model-compatibility-and-benchmarks).

### Connection errors

```
[error] Connection error.
```

This means clawx can't reach the model endpoint. Check:
- Is Ollama running? (`ollama serve` or check if the service is active)
- Is the base URL correct? (`http://localhost:11434/v1` for Ollama)
- Is the model pulled? (`ollama list` to check)
- For API providers: is your API key valid?

### Reporting bugs

Clawx is in beta — if something breaks, we want to know. [Open an issue](https://github.com/stevenmcsorley/clawx/issues) with:

1. **What you ran** — the command and prompt
2. **What happened** — error message or unexpected behaviour
3. **Your setup** — OS, provider, model, clawx version (`clawx --version`)
4. **Verbose output** — run with `-v` flag for debug logs: `clawx run -v "your prompt"`

### Tested vs untested providers

| Provider | Status |
|----------|--------|
| Ollama | Tested on Windows + Linux |
| DeepSeek API | Tested |
| OpenAI API | Tested |
| Anthropic API | Tested |
| LM Studio | Untested — should work (OpenAI-compatible) |
| vLLM | Untested — should work (OpenAI-compatible) |
| llama.cpp server | Tested — tool calling depends on model |
| Google / Mistral | Untested |

If you test a provider that isn't listed, let us know how it went.

## FAQ

### Why not just use Claude Code with Ollama?

You can — Anthropic added [Ollama integration](https://docs.ollama.com/integrations/claude-code). But Claude Code "requires a large context window. We recommend at least 64k tokens" (Anthropic & Ollama, 2026). That 64k minimum exists because the system prompt, tool definitions, and protocol overhead consume a significant portion of the context before your first message is even sent. Clawx's orchestration is ~200 lines. The system prompt is lean. Tool definitions are minimal. This means more of your context window goes to actual work, not platform scaffolding — which matters when you're running a 7B model on 12GB VRAM where every token counts.

### How is this different from OpenCode?

OpenCode is a polished coding assistant with LSP integration, GitHub PR reviews, and a large community. It's great at what it does — code in your current project directory.

Clawx is designed for a different workflow: **code → deploy**. SSH is a first-class tool with named targets and dedicated config, not a shell hack. The agent can scaffold code on your machine then deploy it to a Raspberry Pi, a VPS, or a Docker host — all from one prompt. It also runs on modest hardware (12GB VRAM) with local models, and doesn't eat your context window with platform overhead.

Different tools for different workflows.

### Does it work with models that don't support tool calling?

Yes. Clawx auto-detects when a model doesn't support structured tool calls and switches to **chat mode** — no crash, no error. You can also toggle manually with `/chat` in the TUI, or use `clawx chat` which always runs without tools. See [Agent mode vs chat mode](#agent-mode-vs-chat-mode) for details.

## License

MIT. Built on the open-source [pi-coding-agent](https://github.com/badlogic/pi-mono) SDK (MIT).
