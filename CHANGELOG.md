# Changelog

All notable changes to Clawx will be documented in this file.

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