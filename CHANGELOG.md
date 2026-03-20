# Changelog

All notable changes to Clawx will be documented in this file.

## [0.4.59] - 2025-01-15

### Fixed Remote Peer Status Truth In Master Status
- **Reachable peer masters now display as `idle` instead of stale `offline`** in `agent_master_status`
- This keeps peer health and peer status aligned so the dashboard reflects reality more truthfully
- Particularly useful now that both Ubuntu and Raspberry Pi peer masters are live on the LAN

### Technical Changes
- Updated `src/tools/agentMasterStatus.ts` to upsert remote peer status based on live health checks before rendering

## [0.4.58] - 2025-01-15

### Fixed Fresh Global Install Packaging
- **Removed broken local `file:` package dependencies** from the published package manifest that were causing fresh global installs to fail on new machines like the Raspberry Pi
- This fixes install errors like missing `agent-protocol/package.json` during `npm install -g @halfagiraf/clawx`
- The current runtime does not import those local packages directly, so removing the stale file-dependency entries makes the published package more truthful and installable

### Technical Changes
- Removed stale local `file:agent-protocol` and `file:agent-runtime` dependencies from `package.json`
- Rebuilt and repacked to verify clean package output

## [0.4.57] - 2025-01-15

### Explicit Peer-Master Startup Command
- Added **`agent_peer_serve`** as a clearer explicit command for starting this machine in peer-master mode
- This is a thin honest wrapper over `agent_serve`, not a fake new runtime path
- It makes LAN/cross-master intent clearer without adding heuristic behavior or redundant SSH features

### New Tool
- `agent_peer_serve` — start this Clawx instance as a LAN-reachable peer master for cross-master communication

## [0.4.56] - 2025-01-15

### Cleaner Peer Chat Output
- **Improved `agent_peer_chat` output rendering** so peer replies are flattened to the actual reply text instead of showing the full remote response envelope when possible
- This makes peer chat feel more like normal conversation and more consistent with the already-polished `agent_peer_send` output

### Technical Changes
- Added readable reply extraction in `src/tools/agentPeerChat.ts`

## [0.4.55] - 2025-01-15

### Peer-Master UX Polish
- **Improved `agent_peer_send` output rendering** so peer task results are flattened into readable text instead of raw nested JSON wrappers when possible
- **Improved `agent_master_status` peer visibility** so remote entries are shown as peer masters with direct example commands for peer chat and peer task delegation
- This makes the Windows ↔ Ubuntu peer workflow feel more coherent before expanding to the Raspberry Pi

### Technical Changes
- Added readable-result extraction to `src/tools/agentPeerSend.ts`
- Updated `src/tools/agentMasterStatus.ts` to present remote peers more clearly and actionably

## [0.4.54] - 2025-01-15

### First Peer-Master Task Delegation
- Added a first real version of **peer task delegation** so one Clawx master can ask another registered peer master to execute a tool task over LAN
- This moves the peer feature beyond chat and into actual cross-machine work execution
- Uses the peer master's real `/task`, `/task/:id/status`, and `/task/:id/result` endpoints

### New Tool
- `agent_peer_send` — send a tool task to a registered peer master and wait for completion

### Notes
- This is a first-step peer task path using the peer master's HTTP task endpoints
- It does not yet orchestrate the peer's own worker network automatically
- It is explicit peer-to-peer delegation, not full federation

## [0.4.53] - 2025-01-15

### Fixed Peer-Master Chat gRPC Warning Spam
- **Peer-master HTTP chat no longer tries to stream gRPC frames back to fake/non-connected caller IDs**
- This fixes noisy warnings like `[gRPC] Agent peer-master not found` on the remote master when receiving `agent_peer_chat` requests
- Peer chat remains real, but now behaves correctly for HTTP peer callers instead of pretending they are connected gRPC agents

### Technical Changes
- Updated `src/core/agent-server.ts` to only stream chat/tool frames back to the speaker when the speaker is an actual connected gRPC agent

## [0.4.52] - 2025-01-15

### LAN-Accessible Master HTTP Binding
- **Changed the agent HTTP server to bind on `0.0.0.0` instead of `localhost`** so other machines on the LAN can reach a running Clawx master
- This is required for real peer-master communication between your Windows machine, Ubuntu laptop, and Raspberry Pi
- Local-only serving still works, but masters are now reachable via their LAN IP when the network/firewall allows it

### Technical Changes
- Updated `src/core/agent-server.ts` HTTP bind host from `localhost` to `0.0.0.0`

## [0.4.51] - 2025-01-15

### First Explicit LAN Peer-Master Support
- Added a first real version of **master-to-master LAN communication** using explicit peer registration instead of fake auto-discovery or brittle heuristics
- You can now register another Clawx master by HTTP endpoint and send it a direct chat turn as a peer
- This is a minimal first step toward LAN federation between your Windows machine, Ubuntu laptop, and Raspberry Pi

### New Tools
- `agent_peer_add` — register another Clawx master on the LAN by name and endpoint
- `agent_peer_chat` — send a chat turn to a registered peer master

### Notes
- This is explicit registration, not auto-discovery
- It currently uses the peer master's real `/health` and `/chat` endpoints
- It is a first-step peer/master feature, not full federated worker delegation yet

## [0.4.50] - 2025-01-15

### More Surgical Windows Worker Task Popup Mitigation
- **Reworked Windows streaming command execution again** to use a hidden Node host process with IPC instead of launching a visible shell host directly from the worker
- This specifically targets the recurring task-time popup regression while preserving real incremental stdout/stderr streaming
- The command still executes for real; only the host/process strategy changed

### Technical Changes
- Updated `src/utils/streaming-bash-wrapper.ts` to run Windows streamed commands through a hidden Node child that proxies stdout/stderr over IPC

## [0.4.49] - 2025-01-15

### Retuned Windows Worker Task Execution To Reduce Popup Regression
- **Adjusted Windows worker command execution again** to use a hidden PowerShell host around `cmd.exe` for streamed task commands
- This targets the reported regression where a popup window reappeared during worker task execution even though worker spawn remained quiet
- Keeps live stdout/stderr streaming while trying a quieter Windows-native command host path

### Technical Changes
- Updated `src/utils/streaming-bash-wrapper.ts` to use hidden PowerShell command hosting on Windows

## [0.4.48] - 2025-01-15

### Removed HTTP Task Fallback From `agent_send`
- **`agent_send` now uses direct gRPC task dispatch only**
- If gRPC task delivery fails, the command now fails honestly instead of silently switching to the old HTTP compatibility path
- This makes the canonical live transport architecture clearer and removes another active duplicate runtime path

### Technical Changes
- Removed HTTP `/task` fallback dispatch from `src/tools/agentSend.ts`
- Removed follow-up HTTP status/result polling that only existed for fallback-dispatched tasks
- Task transport for `agent_send` is now always real gRPC or an explicit failure

## [0.4.47] - 2025-01-15

### Removed Unused Parallel gRPC Implementations
- Deleted old unused gRPC implementation files that were no longer part of the active runtime
- This reduces architectural duplication and makes the real live transport path clearer: `src/core/grpc/grpc-client.ts` + `src/core/grpc/grpc-server.ts`
- Helps keep the codebase honest by removing superseded gRPC variants instead of leaving multiple competing implementations around

### Removed Files
- `src/core/agent-grpc-client.ts`
- `src/core/agent-grpc.ts`
- `src/core/grpc/agent-grpc-client.ts`
- `src/core/grpc/agent-grpc-server.ts`

## [0.4.46] - 2025-01-15

### Collaboration Guide Numbering Polish
- Fixed the `agent_master_status` collaboration guide so step numbering is generated cleanly instead of skipping numbers depending on runtime conditions
- Small UX polish, but it makes the collaboration dashboard read more cleanly and professionally

### Technical Changes
- `src/tools/agentMasterStatus.ts` now builds guide steps dynamically and numbers them consistently

## [0.4.45] - 2025-01-15

### Better Master-Side Collaboration Visibility
- **Improved `agent_master_status`** so it is more useful as a real collaboration dashboard instead of just a raw registry dump
- Local workers now show persona info when available, plus quick example commands for direct chat and task delegation
- Added a clearer collaboration guide so users can naturally move from seeing workers to actually using them without relying on hidden routing heuristics

### Technical Changes
- `agent_master_status` now performs registry cleanup before rendering
- Worker entries include persona summaries and quick `agent_chat` / `agent_send` examples
- Recommendations section replaced with a more practical collaboration guide

## [0.4.44] - 2025-01-15

### Clearer Worker Chat Streaming Presentation
- **Improved `agent_chat` live rendering** so worker replies are shown as a cleaner chat block instead of a confusing mixture of header text and raw streamed fragments
- Tool activity is now visually separated from normal assistant prose under a dedicated `🔧 Tool activity` section
- This should make streamed worker chat easier to read and understand while a reply is still arriving

### Technical Changes
- Updated `src/tools/agentChat.ts` streaming formatting
- Chat deltas now build a clearer reply block
- Tool stdout/stderr is grouped separately instead of blending directly into the prose stream

## [0.4.43] - 2025-01-15

### Added One-Pass Worker Chat Constraint Repair
- **Worker chat now validates some explicit formatting constraints** from the user prompt and performs one automatic repair pass when the first reply violates them
- Currently checks constraints like:
  - `exactly N bullet points`
  - `exactly N numbered items`
  - `JSON only`
- This targets richer chat cases where the worker stayed on-topic but still violated explicit output shape requirements

### Technical Changes
- Added lightweight output-constraint detection and validation in `src/utils/worker-model-caller.ts`
- If the first reply violates explicit constraints, the worker reruns the model once with a repair instruction instead of returning the malformed answer directly

## [0.4.42] - 2025-01-15

### Stronger Worker Chat Grounding Instructions
- **Tightened worker chat grounding** so persona replies are explicitly constrained to the current user message, provided additional context, stored memory context, or real tool output from the current turn
- Added direct anti-invention instructions for cases where the user asks for observed/verified facts only
- This targets richer chat failures where workers replied coherently but drifted into unrelated topics or invented evidence during debate/synthesis prompts

### Technical Changes
- Updated `src/utils/worker-model-caller.ts` system prompt construction with stricter grounding and anti-hallucination instructions

## [0.4.41] - 2025-01-15

### Reduced Windows Task-Time Console Flash
- **Adjusted Windows streaming command execution again** to use `child_process.exec(..., { windowsHide: true })` for worker `bash` tasks
- This targets the brief console window flash that could still appear during worker task execution even after silent worker spawn was fixed
- Keeps real streamed stdout/stderr behavior while trying a Windows-native hidden execution path that is often quieter than manual shell spawning

### Technical Changes
- Updated `src/utils/streaming-bash-wrapper.ts` to use hidden `exec()` on Windows and keep spawn-based streaming on Unix-like systems

## [0.4.40] - 2025-01-15

### Cleaner Task Truth And Quieter Windows Task Execution
- **Reduced stale task-count lies** in `agent_list` by running offline-agent marking and old-task cleanup before rendering registry summary
- **Made streaming worker bash execution quieter on Windows** by using `cmd.exe` with `windowsHide: true` instead of spawning `bash`, which should reduce the brief task-time console popup you noticed
- Keeps real incremental output streaming while aligning command execution with the native Windows shell path

### Technical Changes
- Updated `src/tools/agentList.ts` to run registry cleanup before computing summary counts
- Reworked `src/utils/streaming-bash-wrapper.ts` to use Windows-native hidden command execution and keep shell spawning explicit and truthful

## [0.4.39] - 2025-01-15

### Fixed Parallel Worker Spawn Port Race
- **Serialized local agent spawn port allocation** with a filesystem lock so concurrent `agent_spawn_local` calls cannot both claim the same worker port
- Prevents duplicate endpoint assignment like two fresh workers both being given `http://localhost:43121`
- Reduces downstream identity/routing corruption where one named worker could accidentally point at another worker's live process

### Technical Changes
- Added a spawn lock in `src/tools/agentSpawnLocal.ts` around port selection and worker startup
- Includes stale lock cleanup and guaranteed lock release in `finally`

## [0.4.38] - 2025-01-15

### Windows Worker Spawn Without Extra Console Window
- **Improved Windows worker spawning** to avoid `shell: true` command wrapping and prefer direct spawning of `clawx.cmd` / direct executable arguments
- This should reduce or eliminate extra terminal/debug window popups when spawning background worker agents on Windows
- Keeps detached background worker behavior while making normal worker startup quieter and more polished

### Technical Changes
- Updated `src/tools/agentSpawnLocal.ts` to prefer `clawx.cmd` on Windows when using the global command
- Replaced Windows `spawn(fullCommand, { shell: true })` with direct argument spawning using `shell: false`

## [0.4.37] - 2025-01-15

### Plain-Text Worker Result Extraction
- **Improved `agent_send` result flattening again** so JSON-stringified nested tool results are parsed and reduced to their actual text output when possible
- Worker tasks like `ls`, `read`, `search_files`, and `bash` should now render their real text output directly instead of showing a JSON object containing a `content` array
- Keeps structured JSON fallback only when no readable text can be extracted

### Technical Changes
- Enhanced recursive result extraction in `src/tools/agentSend.ts` to parse JSON string payloads before returning output
- Allows final worker task output to collapse nested `output -> content -> text` wrappers into plain text

## [0.4.36] - 2025-01-15

### Removed Remaining SSE-Named Runtime File
- **Deleted the last SSE-era streaming file** from the active source tree: `src/utils/streaming-events.ts`
- Replaced it with a gRPC-native type-only module: `src/utils/grpc-stream-events.ts`
- This removes another misleading artifact from the runtime and keeps the live transport naming aligned with the actual gRPC implementation

### Technical Changes
- Added `src/utils/grpc-stream-events.ts`
- Updated gRPC streaming helpers to import `StreamEvent` from the gRPC-native type module
- Removed `src/utils/streaming-events.ts` entirely

## [0.4.35] - 2025-01-15

### Removed Dead SSE Runtime Logic
- **Removed leftover SSE/EventSource runtime implementation** from `src/utils/streaming-events.ts`
- That file now exports only shared stream event types used by the active gRPC runtime, instead of carrying dead in-memory SSE broadcaster/handler code
- Reduces misleading duplicate streaming architecture and helps keep the app aligned with a single truthful live transport path

### Technical Changes
- Replaced the old SSE/event-bus implementation in `src/utils/streaming-events.ts` with type-only definitions
- Preserved active gRPC streaming helpers that import the shared `StreamEvent` type

## [0.4.34] - 2025-01-15

### Removed Fake Worker Chat Fallback Replies
- **Removed synthetic worker chat fallback responses** that previously pretended to answer when the real model call failed
- Worker chat now fails truthfully instead of fabricating a generic fallback reply, aligning runtime behavior with the no-fake/no-pretend standard
- Preserves error visibility so real model/provider failures can be diagnosed instead of hidden behind invented text

### Technical Changes
- Updated `src/utils/worker-model-caller.ts` to throw on model failure instead of generating a fake fallback reply
- Worker chat paths now surface real failures rather than simulated assistant output

## [0.4.33] - 2025-01-15

### Readable Worker Task Result Rendering
- **Improved `agent_send` final output formatting** so successful worker task results prefer human-readable text content over nested JSON envelopes
- Completed worker tasks like `ls`, `read`, `search_files`, and `bash` should now display their real output directly when possible
- Preserves JSON fallback only when no readable text content can be extracted from the result structure

### Technical Changes
- Added recursive readable-result extraction in `src/tools/agentSend.ts`
- Updated final success rendering to flatten nested `content` / `details` / `result` wrappers into direct task output

## [0.4.32] - 2025-01-15

### Minimal Context gRPC Task Dispatch
- **Fixed oversized gRPC task dispatch payloads** by sending only a sanitized minimal execution context to workers (`cwd`, `workerWorkspace`, `masterWorkspace`) instead of the full interactive tool/session context
- Addresses real installed-runtime failures like `RESOURCE_EXHAUSTED: Received message larger than max` when delegating even simple tasks from large active sessions or repositories
- Keeps Clawx scalable for large applications by treating gRPC as a lean control plane while workers operate on the codebase locally from disk

### Technical Changes
- Updated `src/tools/agentSend.ts` to sanitize task execution context before gRPC dispatch
- Updated HTTP fallback task context to use the same minimal context shape
- Prevents trivial delegated tasks from inheriting huge live-session payloads

## [0.4.31] - 2025-01-15

### Foundational gRPC Client Stream Stability Fix
- **Removed the incorrect 10-second deadline** from the long-lived worker↔master bidirectional gRPC stream in `GrpcClient`
- **Hardened incoming frame decoding** so Buffer / Uint8Array payloads are normalized before frame handling, addressing runtime logs like `Unknown frame type: Buffer`
- This targets worker disconnect/reconnect churn and unstable task/chat behavior caused by a poisoned or prematurely expiring gRPC stream

### Technical Changes
- Updated `src/core/grpc/grpc-client.ts` to stop applying a short deadline to persistent bidi streams
- Added more robust incoming frame normalization and malformed-frame dropping in the gRPC client data handler

## [0.4.30] - 2025-01-15

### Windows Local Worker Persistence Fix
- **Improved Windows local worker lifetime** by spawning worker processes in detached mode and calling `unref()` so they behave more like independent background agents
- This targets cases where freshly spawned workers appeared healthy initially but then disappeared from the registry shortly afterward, making task delegation look broken or inconsistent
- Aligns Windows worker spawning behavior more closely with the existing detached Unix-style behavior

### Technical Changes
- Updated Windows local spawn in `src/tools/agentSpawnLocal.ts` to use `detached: true`
- Added best-effort `agentProcess.unref()` after spawn so worker lifetime is less coupled to the parent tool invocation

## [0.4.29] - 2025-01-15

### Stale Task Cleanup Improvements
- **Improved `agent_cleanup`** so it now removes stale pending/running tasks tied to missing or offline agents once they exceed the cleanup threshold
- This helps keep the registry truthful during heavy restart/spawn testing instead of accumulating forever-running task residue from dead workers
- Makes iterative debugging and installed-runtime validation less noisy and less dependent on manual registry cleanup

### Technical Changes
- Added stale running/pending task cleanup logic to `src/core/agent-registry.ts`
- Updated `src/tools/agentCleanup.ts` to use the registry cleanup helper for both old terminal tasks and stale running tasks

## [0.4.28] - 2025-01-15

### Direct gRPC Task Lifecycle Fix
- **Removed bogus inbound `tool_started` worker handling** that simulated tool execution when the worker should only begin real task execution from `task_started`
- This eliminates a leftover fake execution path that could corrupt direct gRPC task lifecycle behavior and interfere with proper terminal completion
- Worker task execution is now anchored to the real `task_started` → execute tool → emit tool/task result frames flow

### Technical Changes
- Updated `src/core/worker-agent.ts` to stop reacting to inbound `tool_started` frames
- Removed obsolete `handleToolStarted()` simulation code from the worker

## [0.4.27] - 2025-01-15

### Correct Task Transport Tagging for HTTP Fallback
- **Fixed HTTP fallback tasks still being tagged as gRPC** in the master registry
- This prevented status/result paths from treating fallback-delivered tasks as HTTP-backed work, which could leave them stuck in `running` even after fallback polling logic was added
- `agent_send` now updates task transport metadata to `http` when direct gRPC delivery fails and fallback dispatch is used

### Technical Changes
- Updated `src/tools/agentSend.ts` so fallback-dispatched tasks are recorded with `__transport: 'http'`
- Allows downstream status/result logic to follow the correct truth path for fallback-delivered tasks

## [0.4.26] - 2025-01-15

### HTTP Fallback Task Completion Tracking
- **Fixed `agent_send` hanging in `running` after HTTP fallback dispatch** by polling the worker's `/task/:id/status` and `/task/:id/result` endpoints when direct gRPC task delivery is unavailable
- This restores end-to-end completion/result reporting for fallback-delivered tasks instead of leaving them indefinitely pending in the master view
- Keeps gRPC as the primary path while making fallback behavior operationally usable

### Technical Changes
- Updated `src/tools/agentSend.ts` to detect HTTP fallback transport and poll the worker for terminal task state/result
- Task registry updates now reflect HTTP-fallback completion instead of remaining stuck in `running`

## [0.4.25] - 2025-01-15

### Worker Persona Refresh on Chat Turns
- **Fixed stale/default persona behavior in worker chat** by reloading `persona.json` and `memory.json` from the worker workspace at the start of each incoming chat turn
- This improves correctness after `agent_persona_set`, so live workers can pick up updated personas without requiring a respawn
- Addresses cases where workers replied as generic task assistants even though persona files had been updated successfully

### Technical Changes
- Updated `src/core/worker-agent.ts` to refresh persona and memory from disk inside `handleChatMessage()` before generating the response
- Preserves existing in-memory fallback behavior when no persisted persona/memory exists

## [0.4.24] - 2025-01-15

### Agent Task Send Reliability Fallback
- **Fixed intermittent `agent_send` delivery failures** where `grpcServer.sendTask(...)` could return false even though the worker was healthy and reachable
- `agent_send` now falls back to the worker's existing HTTP `/task` compatibility path when direct gRPC task dispatch is unavailable in the current session
- Preserves registry/task tracking and streamed event handling while keeping task delivery reliable during gRPC connection edge cases

### Technical Changes
- Added HTTP compatibility fallback in `src/tools/agentSend.ts` when direct gRPC task dispatch fails
- Retains gRPC as the primary/canonical path while using HTTP only as a delivery fallback

## [0.4.23] - 2025-01-15

### TUI-Compatible Partial Streaming for Agent Chat/Tasks
- **Adjusted live tool updates to match pi-coding-agent TUI expectations**: `agent_chat` and `agent_send` now emit partial tool result objects (`content`/`details`) instead of custom ad-hoc event payloads
- This should allow the interactive tool execution component to render incremental transcript/task output above the existing `Working...` animation instead of waiting for final completion
- Preserves the readable transcript/task formatting introduced in `0.4.22`, but now in the library-compatible partial-update shape

### Technical Changes
- Reworked `onUpdate(...)` payloads in `src/tools/agentChat.ts`
- Reworked `onUpdate(...)` payloads in `src/tools/agentSend.ts`
- Kept spinner/status behavior intact while improving partial output rendering compatibility

## [0.4.22] - 2025-01-15

### Streaming UX Improvements for Agent Chat and Tasks
- **Improved live agent chat presentation**: `agent_chat` now converts internal gRPC chat events into readable streaming output with speaker headers and incremental text deltas
- **Improved live task presentation**: `agent_send` now streams task progress, tool starts, stdout/stderr, and terminal states as cleaner terminal-style text instead of exposing raw event structure
- **Better multi-agent readability**: agent interactions should now look more like a conversation/transcript and less like JSON protocol traffic in the TUI

### Technical Changes
- Added pretty streaming event adaptation in `src/tools/agentChat.ts`
- Added pretty streaming event adaptation in `src/tools/agentSend.ts`
- Preserved final tool return values while making in-flight updates more human-readable

## [0.4.21] - 2025-01-15

### Chat Fallback Streaming Fix
- **Fixed intermittent `agent_chat` "No reply received" failures** when the worker model path fell back after an upstream model/stream error
- Worker chat fallback responses now emit `agent_message_start`, `agent_message_delta`, and `agent_message_end` frames so the master always receives a terminal chat event
- `agent_chat` now also accepts a fallback `finalResult.reply` path when streamed end events are absent

### Impact
- Restores reliable chat completion semantics even when the model call degrades to the fallback reply path
- Improves live chat streaming continuity instead of silently waiting and then dumping `No reply received`

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