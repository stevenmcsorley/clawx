# Changelog

All notable changes to Clawx will be documented in this file.

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