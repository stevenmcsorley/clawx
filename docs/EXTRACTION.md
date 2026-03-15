# Extraction & Migration Notes

How Clawdex was extracted from the OpenClaw codebase.

## Source analysis

OpenClaw (v2026.3.14) is a multi-channel AI gateway with 50+ messaging extensions,
50+ skills, and a full platform architecture. The source is a monorepo with:

- `src/` — Main application (~500+ source files)
- `extensions/` — 50+ channel/feature extensions
- `skills/` — 50+ skill bundles
- `apps/` — Mobile apps (iOS, Android, macOS)
- `packages/` — Compatibility shims

The actual agent loop and coding tools live in three MIT-licensed npm packages:
- `@mariozechner/pi-agent-core` (v0.58.0) — General-purpose agent loop
- `@mariozechner/pi-ai` (v0.58.0) — LLM provider abstraction
- `@mariozechner/pi-coding-agent` (v0.58.0) — Coding tools and session management

## Extraction decisions

### KEPT AS-IS (used as npm dependencies)

| Component | Package | What it provides |
|-----------|---------|-----------------|
| Agent loop | `pi-agent-core/agent-loop.js` | The core user→model→tool→result→loop cycle (308 lines) |
| Event stream | `pi-ai/event-stream.js` | Async iterator for agent events |
| Message types | `pi-ai/types.ts` | UserMessage, AssistantMessage, ToolResultMessage, ToolCall, etc. |
| Provider streaming | `pi-ai/providers/openai-completions.js` | OpenAI-compatible chat/completions streaming |
| Provider registry | `pi-ai/api-registry.js` | API provider registration and dispatch |
| Model types | `pi-ai/models.ts` | Model descriptor with cost, context window, etc. |
| read tool | `pi-coding-agent/core/tools/read.js` | File reading with offset/limit |
| write tool | `pi-coding-agent/core/tools/write.js` | File creation/overwrite |
| edit tool | `pi-coding-agent/core/tools/edit.js` | Search-and-replace editing |
| bash tool | `pi-coding-agent/core/tools/bash.js` | Shell command execution |
| grep tool | `pi-coding-agent/core/tools/grep.js` | Regex content search |
| find tool | `pi-coding-agent/core/tools/find.js` | File pattern search |
| ls tool | `pi-coding-agent/core/tools/ls.js` | Directory listing |
| convertToLlm | `pi-coding-agent/core/messages.js` | AgentMessage→Message conversion |

These packages are clean, well-typed, MIT-licensed, and designed for standalone use.
Using them as dependencies is the cleanest extraction path.

### ADAPTED (rewritten with inspiration from OpenClaw patterns)

| Component | OpenClaw source | Clawdex file | What changed |
|-----------|----------------|--------------|-------------|
| Model resolution | `src/agents/pi-embedded-runner/model.ts` (398 lines) | `src/core/provider.ts` (~60 lines) | Stripped auth rotation, config overrides, OpenRouter pre-fetch, forward-compat. Kept the core pattern of constructing a Model with api:"openai-completions" for local endpoints. |
| Session persistence | `src/config/sessions/store.ts` (400+ lines) | `src/core/session.ts` (~100 lines) | Stripped TTL caching, atomic writes, lock acquisition, delivery context, entry capping, disk budgets. Simple JSON file per session. |
| Streaming | `src/agents/pi-embedded-subscribe.ts` (726 lines) | `src/core/streaming.ts` (~120 lines) | Stripped thinking tag parsing, block chunking, messaging dedup, compaction retry. Direct event→terminal rendering. |

### WRITTEN FRESH (not present in OpenClaw)

| Component | Clawdex file | Why new |
|-----------|-------------|---------|
| SSH execution | `src/tools/sshRun.ts` | OpenClaw has no SSH support — remote execution uses a gateway/node-host abstraction |
| Git status | `src/tools/gitStatus.ts` | OpenClaw doesn't expose git as a model tool |
| Git diff | `src/tools/gitDiff.ts` | Same |
| Search files | `src/tools/searchFiles.ts` | Convenience wrapper using rg/grep |
| Config loading | `src/config/index.ts` | OpenClaw's config system is deeply coupled to the platform |
| System prompt | `src/utils/system-prompt.ts` | OpenClaw uses bootstrap documents and context engines |
| CLI/REPL | `src/cli/main.ts`, `src/cli/repl.ts` | OpenClaw's CLI handles 40+ commands for platform management |

### DISCARDED (not carried over)

| OpenClaw subsystem | Size | Why discarded |
|-------------------|------|---------------|
| `src/channels/` | 50+ extensions | Telegram, WhatsApp, Discord, etc. — not needed |
| `src/gateway/` | ~2000 lines | Platform gateway server |
| `src/memory/` | ~1500 lines | Embedding-based long-term memory |
| `src/plugins/` | ~1000 lines | Plugin marketplace infrastructure |
| `src/context-engine/` | ~800 lines | Complex context management |
| `src/auto-reply/` | ~1200 lines | Channel auto-reply and directives |
| `src/agents/pi-tools.ts` | 619 lines | 6-layer tool policy pipeline |
| `src/agents/pi-embedded-runner/run.ts` | 3000+ lines | Platform orchestration with failover, auth rotation, sandbox |
| `src/agents/bash-tools.exec.ts` | 599 lines | Sandbox/approval/gateway exec routing |
| `src/agents/bash-tools.exec-approval*.ts` | ~400 lines | Approval request/followup system |
| `src/agents/tool-policy*.ts` | ~500 lines | Tool allow/deny policies |
| `src/agents/sandbox*.ts` | ~300 lines | Docker sandbox management |
| `src/infra/exec-safe-bin*.ts` | ~200 lines | Safe binary runtime policies |
| `src/agents/openclaw-tools.ts` | ~400 lines | Messaging, memory, sessions, cron tools |
| `src/agents/auth-profiles.ts` | ~600 lines | Auth profile rotation and cooldown |
| `src/cron/` | ~500 lines | Scheduled task system |
| `src/hooks/` | ~300 lines | Hook system for channel events |
| `apps/` | Mobile apps | iOS, Android, macOS — not needed |
| `extensions/` | 50 extensions | Channel-specific extensions |
| `skills/` | 50 skills | Skill bundles |

Total discarded: ~15,000+ lines of platform code, 50+ extensions, 50+ skills, 3 mobile apps.

## Dependency analysis

### What OpenClaw pulls in that we don't need

OpenClaw's package.json has ~100 dependencies. Clawdex uses 10:

| Clawdex dep | Purpose |
|------------|---------|
| @mariozechner/pi-agent-core | Agent loop |
| @mariozechner/pi-ai | Provider abstraction |
| @mariozechner/pi-coding-agent | Coding tools |
| @sinclair/typebox | Tool parameter schemas |
| chalk | Terminal colors |
| commander | CLI parsing |
| dotenv | .env loading |
| ora | Spinners (optional) |
| ssh2 | SSH client |
| zod | Schema validation |

### What pi-ai provides that matters

The `@mariozechner/pi-ai` package includes built-in support for:
- OpenAI Chat Completions API (what llama.cpp, ollama, vllm expose)
- OpenAI Responses API
- Anthropic Messages API
- Google Generative AI
- Mistral Conversations
- Azure OpenAI
- Bedrock

This means any OpenAI-compatible local endpoint works out of the box.

## Architecture comparison

### OpenClaw flow (simplified)

```
User message
  → Channel adapter (Telegram/WhatsApp/CLI/...)
    → Session routing (channel + account + thread)
      → Agent config resolution (agent scope, group, profile)
        → Auth profile selection + rotation
          → Context engine (bootstrap docs, skills, memory)
            → Tool policy pipeline (6 layers)
              → pi-agent-core agentLoop()
                → Provider stream (with failover + retry)
                  → Tool execution (sandbox/gateway/node routing)
                    → Approval system (if configured)
                      → Result → compaction → next turn
            → Block chunking for channel message limits
          → Channel-specific reply formatting
        → Session persistence with TTL caching
      → Channel delivery
    → Auto-reply processing
  → User
```

### Clawdex flow

```
User message (CLI)
  → Config from .env / clawdex.json
    → Model resolution (provider + baseUrl + model ID)
      → pi-agent-core agentLoop()
        → Provider stream (pi-ai)
          → Tool execution (direct, no routing)
            → Result → next turn
      → Terminal streaming renderer
    → JSON file session save
  → User
```

## What was preserved vs what was lost

### Preserved (the useful core)
- The agent loop behavior: model decides what tools to use, calls them, iterates
- OpenAI-compatible provider support for local models
- Robust coding tools (read, write, edit, bash, grep, find, ls)
- Streaming output as the model works
- Multi-turn session support
- The model's freedom to decide what files to create

### Lost (intentionally)
- Multi-channel support
- Approval workflows
- Sandbox isolation
- Auth profile rotation with cooldown
- Context window compaction (pi-coding-agent handles basic compaction)
- Plugin hooks
- Memory/embedding systems
- Failover between providers
- Skill discovery and loading
- Gateway/daemon architecture

### Added (new in Clawdex)
- SSH execution (`ssh_run` tool)
- Git tools (`git_status`, `git_diff`)
- File search tool (`search_files`)
- Simple JSON config file support
- Named SSH targets
