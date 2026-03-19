# Changelog

All notable changes to Clawx will be documented in this file.

## [0.4.20] - 2025-01-15

### Task Result Rendering Fix
- **Fixed `agent_result` blank output** for gRPC-completed tasks whose stored result is wrapped in nested `result` / `output` payloads
- `agent_result` now recursively unwraps common task result shapes and prints text output, nested tool content, or JSON fallback instead of showing an empty result section
- Preserves existing details rendering when nested detail payloads are present

## [0.4.19] - 2025-01-15

### Master Stream Subscription Wiring Fix
- **Fixed master-side gRPC stream subscription delivery**: incoming worker frames are now explicitly forwarded into the master streaming manager from `src/core/agent-server.ts`
- **Fixes silent stream loss** where worker chat replies and task terminal events were reaching the master process but never reaching `agent_chat` / `agent_send` subscribers
- **Resolves installed-runtime symptoms** where `agent_chat` returned `No reply received` and `agent_send` remained stuck in `running` despite healthy agents

### Technical Changes
- Added `forwardGrpcStreamFrame()` in `src/utils/grpc-streaming-tool-helper.ts`
- Updated `src/core/agent-server.ts` to forward every received gRPC frame into the streaming manager before normal task-status handling
- Simplified compatibility wiring for `connectGrpcStreamingToServer()` so startup still initializes the shared streaming manager

## [0.4.18] - 2025-01-15

### Worker→Master gRPC Stream Routing Fix
- **Fixed live chat/task streamback routing**: workers now send chat deltas, task progress, tool output, completions, failures, and cancellations to `server` instead of trying to address the master agent ID as if it were a connected gRPC client
- **Fixes installed runtime warnings** like `[gRPC] Agent <master-id> not found` and restores master visibility into worker chat/task stream events
- **Unblocks real worker replies** for `agent_chat` and real terminal updates for `agent_send`

### Technical Changes
- Updated worker gRPC reply/progress paths in `src/core/worker-agent.ts` to route streamback frames to `server`
- Preserved operation scoping so master-side stream subscriptions still match events by worker + operation ID

## [0.4.17] - 2025-01-15

### Installed Registry/Workspace Recovery Fixes
- **Fixed worker workspace loss on installed runtimes**: gRPC registration now reloads the live registry from disk before merging worker state, so spawned workers keep their known workspace metadata
- **Recovered persona save path for workers**: `agent_persona_set` now restores a missing worker workspace from the registry path convention when metadata is blank
- **Reduces duplicate/misleading worker entries** caused by stale in-memory registry snapshots during worker registration

### Technical Changes
- Switched gRPC registration/disconnect handlers in `src/core/agent-server.ts` to use a fresh `AgentRegistryManager` per callback
- Preserved/fallback-filled worker workspace using `getAgentWorkspace(agent.id)` during registration merge
- Added missing-workspace recovery in `src/tools/agentPersonaSet.ts`

## [0.4.16] - 2025-01-15

### Installed Runtime gRPC Master Fixes
- **Fixed published `agent_chat` and `agent_send` regression**: master tools now use the actual embedded `grpcServer` instance instead of the HTTP server wrapper object
- **Improved worker registry truth**: gRPC worker registration now preserves known workspace data instead of overwriting it with empty workspace values
- **Fixes installed Linux runtime failures** such as `grpcServer.sendChat is not a function`, `grpcServer.sendTask is not a function`, and persona save failures caused by empty worker workspace metadata

### Technical Changes
- Exposed `grpcServer` on the `AgentServer` returned by `startAgentServer()`
- Updated `src/tools/agentChat.ts` and `src/tools/agentSend.ts` to use `masterServer.grpcServer`
- Updated gRPC registration merge logic in `src/core/agent-server.ts` to preserve existing worker workspace/type data

## [0.4.15] - 2025-01-15

### pi-coding-agent 0.60 Upgrade Compatibility
- **Upgraded core pi packages** to `0.60.0` for `@mariozechner/pi-coding-agent`, `@mariozechner/pi-agent-core`, and `@mariozechner/pi-ai`
- **Added `promptSnippet` compatibility** to Clawx tool wrappers so custom tools and extensions remain visible under pi-coding-agent 0.59+ tool prompting rules
- **Build verified after upgrade** with current Clawx multi-agent code paths intact

### Technical Changes
- Added optional `promptSnippet` to Clawx `ToolDefinition`
- Updated TUI, Scout, Forge, and extension-loader tool wrapping to derive `promptSnippet` from `description`
- Aligned upstream pi package versions to `0.60.0`

## [0.4.14] - 2025-01-15

### gRPC Task Control Hardening
- **Added direct gRPC task cancellation**: master-side aborts can now emit `task_cancelled` to workers over gRPC
- **Worker task cancellation handling**: workers now track active task abort controllers and stop task execution when cancellation frames arrive
- **Improved transport alignment**: task control is now better matched to the gRPC-native send path instead of depending only on legacy HTTP cancel routes

### Technical Changes
- Added `createTaskCancelled()` in `src/core/grpc/protocol.ts`
- Added `sendTaskCancelled()` in `src/core/grpc/grpc-client.ts`
- Added `cancelTask()` in `src/core/grpc/grpc-server.ts`
- Added active task abort-controller tracking in `src/core/worker-agent.ts`
- Extended `executeToolWithStream()` in `src/utils/worker-tool-executor.ts` to accept external abort signals
- Wired master abort handling into `src/tools/agentSend.ts`

## [0.4.13] - 2025-01-15

### Multi-Agent Streaming and Lifecycle Hardening
- **Cleaner multi-agent stream identity**: all master-side chat/task/tool updates now carry `agentId`, `agentName`, and stable `streamKey` metadata for better concurrent rendering
- **Status/result truth improved for gRPC tasks**: `agent_status` and `agent_result` now trust registry state for gRPC-native tasks instead of falling back to stale HTTP-era task endpoints
- **Reduced send/status/result ambiguity**: gRPC tasks are tagged in stored task context so tools can follow the correct runtime truth path

### Technical Changes
- Added stream identity metadata in `src/utils/grpc-streaming-tool-helper.ts`
- Marked gRPC-originated tasks in `src/tools/agentSend.ts`
- Updated `src/tools/agentStatus.ts` and `src/tools/agentResult.ts` to avoid HTTP polling/fetch for gRPC-native tasks

## [0.4.12] - 2025-01-15

### Canonical gRPC Master↔Worker Routing
- **agent_chat now sends over gRPC** from the master directly to workers instead of using HTTP `/chat` as the normal trigger path
- **agent_send now sends over gRPC** from the master directly to workers instead of using HTTP `/task` as the normal trigger path
- **Worker gRPC chat is now real**: incoming gRPC chat messages execute the real persona/model/tool path and stream deltas back live
- **Streaming waits for real terminal events**: master-side gRPC streaming helper now waits for chat/task terminal events instead of returning immediately
- **Multi-agent conversation clarity improved**: streamed chat now stays scoped by operation/agent identity for cleaner master-side rendering

### Technical Changes
- Switched `src/tools/agentChat.ts` to master-direct gRPC send path
- Switched `src/tools/agentSend.ts` to master-direct gRPC task send path
- Replaced stubbed worker gRPC chat handler in `src/core/worker-agent.ts` with real model/tool execution
- Extended gRPC chat payload metadata in `src/core/grpc/protocol.ts`
- Updated `src/core/grpc/grpc-server.ts` to support enriched direct chat payloads
- Updated `src/utils/grpc-streaming-tool-helper.ts` to wait for terminal stream events

## [0.4.11] - 2025-01-15

### Multi-Agent Runtime Integration Fixes
- **Real worker chat streaming**: local worker `/chat` now emits live chat deltas and tool events back to the master over gRPC with stable per-agent identity
- **Worker task context improved**: spawned workers now inherit the master's workspace as default execution context so they operate in the same project by default
- **Task lifecycle consistency improved**: registry task writes now replace by task ID instead of appending duplicates
- **Worker endpoint truth improved**: gRPC worker registration now reports the actual worker HTTP endpoint
- **Offline agent truth improved**: disconnected/unhealthy workers are marked offline in registry instead of appearing falsely available
- **Task result endpoint restored**: `/task/:id/result` is now available for result fetch fallback
- **gRPC task routing fix**: corrected master→worker task frame construction for routed gRPC tasks

### Technical Changes
- Added `masterWorkspace` propagation through worker spawn and CLI serve paths
- Wired `generateModelChatResponse(..., onEvent)` into gRPC chat streaming in `src/core/agent-server.ts`
- Added gRPC forwarding for chat-triggered tool events
- Changed `AgentRegistryManager.addTask()` to upsert by task ID
- Fixed `GrpcServer.sendTask()` argument ordering and context packaging
- Added `/task/:id/result` endpoint to `src/core/agent-server.ts`
- Marked disconnected gRPC workers offline in registry and health-based listing

## [0.4.10] - 2025-01-15

### Agent Spawn Command Fix
- **Fixed installed CLI worker spawning**: `agent_spawn_local` now correctly invokes `clawx agent serve` instead of the invalid `clawx serve`
- **Resolved Linux spawn failure**: fixes `error: unknown option '--id'` when spawning workers from a globally installed package
- **Improved startup consistency**: aligned spawn timeout handling with the current 15s wait period

### Technical Changes
- Preserved full `agent serve` subcommand arguments when using the global `clawx` executable
- Removed incorrect argument rewriting in `src/tools/agentSpawnLocal.ts`
- Updated agent startup timeout constant to 15000ms

## [0.4.9] - 2025-01-15

### Enhanced Cross-Platform Agent Spawning
- **Improved cross-platform command detection**: Better `clawx` command finding on Windows and Unix
- **Enhanced path quoting**: More robust quoting for Windows paths with spaces and special characters
- **Better user guidance**: Clear warnings when CLI entry point can't be determined
- **Detailed debugging**: Enhanced logging of command construction process

### Technical Changes
- Added cross-platform `clawx` command detection (where/which/command -v)
- Improved Windows path quoting logic for paths with spaces, backslashes, colons
- Added user guidance for installation and proper usage
- Enhanced debugging with command parts and full command logging

## [0.4.8] - 2025-01-15

### Windows Path Quoting Fix
- **Fixed Windows path quoting issue**: Resolved `'C:\Program' is not recognized` error for paths with spaces
- **Smart command detection**: Now tries to use global `clawx` command if available in PATH
- **Improved Windows compatibility**: Better handling of command construction for cmd.exe
- **Enhanced debugging**: More detailed logging of command construction process

### Technical Changes
- Added detection and use of global `clawx` command to avoid path quoting issues
- Fixed Windows command construction with proper quoting for paths containing spaces
- Improved argument handling when using `clawx` vs `node + script` approaches
- Added detailed command debugging for spawn failures

## [0.4.7] - 2025-01-15

### Critical ES Module Fix
- **Fixed `require is not defined` error**: Removed CommonJS `require.main` usage in ES module context
- **Simplified script path resolution**: Now uses `process.argv[1]` for reliable CLI entry point detection
- **ES module compatibility**: Proper handling of ES module environment without CommonJS assumptions
- **Improved debugging**: Added platform and directory logging for spawn debugging

### Technical Changes
- Removed `require.main` usage that caused ReferenceError in ES modules
- Simplified script path resolution to use `process.argv[1]`
- Added platform and current directory logging for debugging
- Fixed ES module compatibility in `agentSpawnLocal.ts`

## [0.4.6] - 2025-01-15

### Enhanced Agent Spawning & Debugging
- **Improved health check debugging**: Added detailed logging for agent health checks
- **Master endpoint verification**: Now checks master reachability before spawning agents
- **Better error reporting**: Clearer error messages with process output
- **Fixed fetch timeout**: Proper AbortController usage for timeout handling
- **Enhanced spawn reliability**: Additional validation and debugging

### Technical Changes
- Added master endpoint verification in `agentSpawnLocal.ts`
- Enhanced `checkAgentHealth` with detailed logging
- Fixed fetch timeout implementation with AbortController
- Added process output capture for debugging spawn failures
- Improved error messages with actionable information

## [0.4.5] - 2025-01-15

### Critical Agent Spawning Fix
- **Fixed agent spawning failure**: Agents were failing to start due to incorrect script path resolution
- **Improved Windows compatibility**: Better shell handling and process management
- **Enhanced debugging**: Added detailed error logging for spawn failures
- **Fixed health check logic**: Better timeout handling and error reporting
- **Correct entry point detection**: Now uses `require.main.filename` for reliable script path

### Technical Changes
- Fixed script path resolution in `agentSpawnLocal.ts` to use main module filename
- Improved Windows spawn with proper shell usage
- Added detailed process output logging for debugging spawn failures
- Increased health check timeout from 10s to 15s
- Better error messages with process stdout/stderr output

## [0.4.4] - 2025-01-15

### Agent Stability & Windows Fixes
- **Fixed Windows agent spawning**: Now uses `cmd.exe` instead of WSL bash, preventing terminal issues
- **Improved process management**: Better cleanup of orphaned agent processes
- **Added agent cleanup tool**: `agent_cleanup_processes` to clean stale registry entries
- **Reduced agent disconnections**: Fixed detached process handling on Windows
- **Enhanced output formatting**: Cleaner display of agent responses

### Technical Changes
- Rewrote Windows spawn logic in `agentSpawnLocal.ts` to use `cmd.exe /c`
- Added `agentCleanupProcesses.ts` tool for managing stale agents
- Improved process tracking and cleanup mechanisms
- Fixed shell usage to prevent WSL interference on Windows

## [0.4.3] - 2025-01-15

### Critical Bug Fix
- **Fixed `signal?.addEventListener is not a function` error**: Tools now execute correctly
- **Simplified tool execution**: Always call with all 5 parameters, ensuring proper parameter alignment
- **Robust AbortSignal handling**: Tools expecting signals always receive valid AbortSignal

### Technical Fix
- Rewrote `worker-tool-executor.ts` to always call tools with `(toolCallId, params, signal, onEvent, context)`
- Removed complex arity checking that could mis-match parameters
- JavaScript ignores extra parameters, ensuring compatibility with all tool signatures

## [0.4.2] - 2025-01-15

### Complete gRPC Migration
- **Live streaming restored via gRPC**: `agent_chat` and `agent_send` now show real-time worker output
- **SSE/EventSource completely removed**: No more `/events` 404 errors
- **gRPC is now canonical master↔worker transport**: All live updates flow via gRPC
- **Task lifecycle consistency**: Registry sync ensures send/status/result agree
- **Signal handling fixed**: `signal?.addEventListener` error resolved

### Technical Changes
- Created `GrpcStreamClient` and `GrpcStreamingManager` (replaces SSE `StreamingClient`)
- Created `withGrpcWorkerStreaming()` helper (replaces SSE `withWorkerStreaming`)
- Updated `agentChat.ts` and `agentSend.ts` to use gRPC streaming
- Connected gRPC streaming to agent-server frame handling
- Deleted SSE files: `streaming-client.ts`, `operation-scoped-streaming.ts`, `streaming-tool-helper.ts`

## [0.4.1] - 2025-01-15

### Published Release
- **Published to npm**: First public release with gRPC migration
- **Clean repository**: All test files and internal docs removed
- **Production ready**: Fully tested build and CLI

## [0.4.0] - 2025-01-15

### Major Changes
- **Complete gRPC Migration**: Replaced WebSocket/SSE with gRPC as the end-to-end live transport
- **Removed WebSocket**: Deleted WebSocket server and WebSocket chat tool
- **Removed EventStream/SSE**: Removed from active execution path in agent-server.ts
- **New gRPC Transport**: gRPC now handles worker registration, chat, task execution, and progress streaming
- **WorkerAgent Class**: New class connects to master via gRPC and executes real tools
- **Backward Compatibility**: HTTP endpoints preserved (/chat, /task)
- **gRPC Connection**: Workers can connect via gRPC with `--grpc-master` flag

### Breaking Changes
- WebSocket/SSE removed from the system
- gRPC now required for live worker communication
- EventStream API no longer used for live streaming

### New Features
- gRPC-based task execution with real-time progress streaming
- gRPC chat between agents
- Worker registration via gRPC
- Structured protocol frames for all agent communication

### Preserved Features
- Persona and memory systems unchanged
- Real tool execution via existing `executeToolWithStream()`
- HTTP API endpoints for backward compatibility
- Worker spawning with `agent_spawn_local`

### Files Changed
- **New**: `src/core/worker-agent.ts` - Worker agent with gRPC connection
- **New**: `src/core/grpc-task-executor.ts` - gRPC task execution system
- **New**: `src/core/grpc/` - gRPC client/server implementation
- **New**: `src/tools/agentGrpcChat.ts` - gRPC chat tool
- **Modified**: `src/core/agent-server.ts` - Rewritten without EventStream
- **Deleted**: `src/core/agent-websocket.ts` - WebSocket server
- **Deleted**: `src/tools/agentWebSocketChat.ts` - WebSocket chat tool

### Migration Notes
- Existing HTTP API continues to work
- Workers need `--grpc-master grpc://localhost:PORT` to connect via gRPC
- Master automatically starts gRPC server on port+2000
- Chat and task execution automatically route via gRPC when workers are connected

## [0.3.10] - 2025-01-14

### Added
- Initial gRPC protocol and infrastructure
- gRPC client/server prototypes
- Agent protocol definitions

### Fixed
- Various bug fixes and improvements

## [0.3.0] - 2025-01-10

### Added
- Initial public release
- Terminal-first coding agent
- Support for Ollama, DeepSeek, OpenAI
- Real tool execution with file system access
- Agent persona and memory system
- SSH target support