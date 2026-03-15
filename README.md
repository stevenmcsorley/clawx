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
# Install
npm install -g clawdex

# Or run from source
git clone <repo>
cd clawdex
npm install
npm run build

# Configure for local llama.cpp / ollama endpoint
cp .env.example .env
# Edit .env with your model endpoint

# Run a task
clawdex run "Create a Flask app with auth and a SQLite database"

# Interactive chat
clawdex chat

# Continue last session
clawdex continue
```

## Configuration

### Environment variables

```bash
CLAWDEX_PROVIDER=openai-completions    # Provider type
CLAWDEX_BASE_URL=http://localhost:8080/v1  # Endpoint URL
CLAWDEX_MODEL=qwen2.5-coder-14b-instruct  # Model name
CLAWDEX_API_KEY=not-needed             # API key (if required)
CLAWDEX_WORK_DIR=/path/to/project      # Working directory
CLAWDEX_THINKING_LEVEL=medium          # off|minimal|low|medium|high
CLAWDEX_MAX_TOKENS=16384               # Max output tokens
```

### Supported providers

| Provider | CLAWDEX_PROVIDER | Notes |
|----------|-----------------|-------|
| llama.cpp | `openai-completions` or `local` | Default. OpenAI-compatible endpoint |
| Ollama | `ollama` | Maps to OpenAI-compatible |
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
clawdex run <prompt>     Run a task and exit
clawdex chat             Interactive REPL
clawdex continue         Resume last session
clawdex sessions         List recent sessions
```

### Run options

```
-m, --model <model>        Model to use
-p, --provider <provider>  Provider type
-u, --base-url <url>       Provider base URL
-d, --work-dir <dir>       Working directory
-v, --verbose              Debug logging
```

### REPL commands

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

### Build a project locally

```bash
clawdex run "Create a Node.js Express API with TypeScript, JWT auth, and a SQLite database. Include proper error handling and a health check endpoint."
```

The agent will:
1. Create the project structure
2. Write all source files
3. Run `npm init` and `npm install`
4. Build with `tsc`
5. Run and test the server

### Remote scaffolding via SSH

```bash
# With SSH targets configured
clawdex run "SSH into my Pi and set up a Node.js service that monitors CPU temperature and exposes it as a Prometheus metric on port 9100"
```

### Interactive coding session

```bash
clawdex chat -d ./my-project
# Then type requests interactively
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
