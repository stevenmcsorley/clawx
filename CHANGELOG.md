# Changelog

All notable changes to Clawx will be documented in this file.

## [0.5.7] - 2025-01-15

### Reused Hardened Spawn Path for Worker Rehydration
- Replaced the custom worker respawn implementation inside `agent_rehydrate_workers` with the same hardened `agent_spawn_local` execution path used for normal worker creation
- Removes a duplicate spawn mechanism that had drifted from the proven installed-runtime/local-runtime behavior
- Aligns rehydration with the already validated cross-platform spawn, health verification, and runtime context handling logic

### Technical Changes
- Updated `src/tools/agentRehydrateWorkers.ts`

## [0.5.6] - 2025-01-15

### Tightened Rehydration Candidate Filtering
- Updated `agent_rehydrate_workers` to skip workers with `autoStart === false`
- Added explicit logging of requested worker names during targeted rehydration
- Helps narrow rehydration runs to the intended workers instead of broad historical scans, improving testability and operator control

### Technical Changes
- Updated `src/tools/agentRehydrateWorkers.ts`

## [0.5.5] - 2025-01-15

### Fixed Direct Master Tool Timeout Cleanup in Task Execution
- Updated `src/core/agent-server.ts` so direct master-tool execution uses a cancellable timeout and clears the timer when the tool resolves or fails
- Targets the lifecycle bug where `agent_rehydrate_workers` could clearly advance internally yet the outer task remained stuck in `running`
- Should improve truthful task completion/failure reporting for direct master tools executed through peer/master task routing

### Technical Changes
- Updated `src/core/agent-server.ts`

## [0.5.4] - 2025-01-15

### Added Rehydration Execution Tracing
- Added targeted logging inside `agent_rehydrate_workers` for matched workers, alive checks, respawn attempts, health polls, and restore success/failure
- Intended to isolate where the still-incomplete rehydration flow stalls after discovery and ownership matching have been fixed
- Keeps the tracing narrow to the rehydration path rather than reintroducing broad transport noise

### Technical Changes
- Updated `src/tools/agentRehydrateWorkers.ts`

## [0.5.3] - 2025-01-15

### Switched Worker Rehydration Discovery to Filesystem-First
- Updated `agent_rehydrate_workers` to discover persisted workers from `~/.clawx/agents/*/agent-config.json` instead of depending primarily on registry state
- Makes rehydration resilient when registry contents are stale or incomplete after peer-master restart
- Matching now uses persisted worker config metadata first and only uses registry data as a supplement
- Expanded debug output to show both config-side and registry-side ownership metadata when matching still fails

### Technical Changes
- Updated `src/tools/agentRehydrateWorkers.ts`

## [0.5.2] - 2025-01-15

### Improved Restart-Safe Rehydration Matching and Diagnostics
- Updated `agent_rehydrate_workers` to prefer restart-stable ownership matching by `ownerMasterEndpoint`, then `ownerMasterName`, then `ownerMasterId`
- Added targeted debug output when no persisted workers match, including the current master identity/endpoint and each persisted worker's owner metadata
- Helps diagnose and resolve peer-master restart cases where rehydration still fails after metadata persistence is fixed

### Technical Changes
- Updated `src/tools/agentRehydrateWorkers.ts`

## [0.5.1] - 2025-01-15

### Fixed Worker Config Rewrite Losing Rehydration Metadata
- Updated `src/cli/agent.ts` so worker startup preserves fields already written into `agent-config.json`
- Fixes the spawned worker process rewriting config and dropping `ownerMasterId`, `ownerMasterName`, `ownerMasterEndpoint`, and `autoStart`
- Unblocks explicit worker rehydration by keeping ownership metadata intact across the worker startup sequence

### Technical Changes
- Updated `src/cli/agent.ts`

## [0.5.0] - 2025-01-15

### Fixed Owner Metadata Persistence for Peer-Routed Worker Spawns
- Updated `agent_spawn_local` to prefer injected active master runtime context when persisting worker ownership metadata
- Fixes peer-routed worker spawns that wrote `agent-config.json` without `ownerMasterId`, `ownerMasterName`, and `ownerMasterEndpoint`
- Unblocks the explicit worker rehydration flow by making fresh peer-hosted worker configs match the current master ownership filter

### Technical Changes
- Updated `src/tools/agentSpawnLocal.ts`

## [0.4.99] - 2025-01-15

### Fixed Rehydration Tool Runtime Context Resolution
- Updated `agent_rehydrate_workers` to use injected active master runtime context (`__activeMasterConfig`, `masterEndpoint`) before falling back to the in-process singleton
- Fixes the peer/master restart case where rehydration was invoked through `agent_peer_send` but reported `No active master context`
- Keeps the explicit worker rehydration flow compatible with peer-executed direct master tools after restart

### Technical Changes
- Updated `src/tools/agentRehydrateWorkers.ts`

## [0.4.98] - 2025-01-15

### Added Explicit Worker Rehydration for Persisted Local Workers
- Added `agent_rehydrate_workers` to restore persisted local workers owned by the current master
- Rehydration checks whether each worker is already alive, verifies `/health.agentId`, and respawns dead workers from saved `agent-config.json`
- New worker spawns now persist owner metadata (`ownerMasterId`, `ownerMasterName`, `ownerMasterEndpoint`, `autoStart`) to support safer future restore logic
- Wired the new rehydration tool into the TUI and direct master-tool execution path so it can be used locally and via peer federation

### Technical Changes
- Updated `src/types/agent.ts`
- Updated `src/tools/agentSpawnLocal.ts`
- Added `src/tools/agentRehydrateWorkers.ts`
- Updated `src/cli/tui.ts`
- Updated `src/core/agent-server.ts`

## [0.4.97] - 2025-01-15

### README Federation Diagram and Real-World Triple-OS Example
- Added a new README section showing the Windows + Ubuntu + Raspberry Pi peer-federation topology
- Included a Mermaid diagram of the control-plane / peer-master / worker layout
- Documented the kinds of real operations already performed with this setup: npm updates, Clawx updates, peer restarts, health checks, worker spawn, persona/memory/chat, delegated tool execution, and runtime debugging
- Better communicates the practical value of Clawx as an explicit multi-machine control plane for home labs and contributors

### Technical Changes
- Updated `README.md`

## [0.4.96] - 2025-01-15

### Documentation and Discovery Refresh
- Rewrote the README around the current Clawx product: local coding agent, local worker/master orchestration, explicit LAN peer federation, and peer-hosted worker delegation
- Added clearer quick starts for local workers and peer federation
- Updated tool-group and use-case framing to match the currently proven runtime
- Refreshed stale command/help discovery wording for peer-federation flows
- Reduced temporary debug instrumentation noise while keeping the runtime fixes, worker logs, and spawn-truth improvements

### Technical Changes
- Updated `README.md`
- Updated `src/tools/agentMasterStatus.ts`
- Updated `src/cli/tui.ts`
- Updated `src/cli/forge-tui.ts`
- Added `docs/current-capabilities.md`

## [0.4.95] - 2025-01-15

### Fixed Spawn Success Truth for Port-Collision Cases
- Tightened worker startup verification so a spawn only succeeds when the healthy endpoint belongs to the newly spawned agent ID
- Prevents false-positive spawn success when a stale process is already bound to the selected worker port
- Added early detection for spawned worker processes that exit before becoming healthy

### Technical Changes
- Updated `src/tools/agentSpawnLocal.ts`

## [0.4.94] - 2025-01-15

### Fixed Circular gRPC Task Payload Serialization in Master→Worker Delivery
- Sanitized delegated `task_started` payloads before sending them over gRPC so non-serializable runtime objects no longer break worker stream delivery
- Prevents `13 INTERNAL: Error serializing response: Converting circular structure to JSON` caused by injected runtime/context objects such as `TreeNode`
- Targets the root cause of peer-routed delegated worker `bash` tasks getting stuck in `running` while the worker disconnects

### Technical Changes
- Updated `src/core/grpc/grpc-server.ts`

## [0.4.93] - 2025-01-15

### Persist Spawned Worker stdout/stderr to Workspace Logs
- Spawned headless workers now persist their stdout/stderr into `worker.log` inside the worker workspace
- Makes delegated-task instrumentation inspectable even when worker processes are detached from the launching master process
- Enables direct inspection of worker-side `task_started`, gRPC receipt, stream lifecycle, and failure/completion traces

### Technical Changes
- Updated `src/tools/agentSpawnLocal.ts`

## [0.4.92] - 2025-01-15

### Enabled Visible Verbose Logging for Spawned Headless Workers
- Added `--verbose` support to `clawx agent serve`
- Spawned workers now start with `--verbose` so delegated-task instrumentation logs are no longer suppressed by the default `warn` log level
- Makes the previously added worker/master gRPC and task-path instrumentation visible in real peer-routed task runs

### Technical Changes
- Updated `src/cli/agent.ts`
- Updated `src/tools/agentSpawnLocal.ts`

## [0.4.91] - 2025-01-15

### Added Master→Worker gRPC Delivery Instrumentation
- Added explicit logging for master gRPC frame delivery to workers, worker gRPC frame receipt, and worker `task_started` handling entry
- Logs now show whether delegated task frames are written by the master, received by the worker client, and routed into worker execution
- Intended to isolate the remaining peer-routed `bash` stall between frame delivery and worker task execution

### Technical Changes
- Updated `src/core/grpc/grpc-server.ts`
- Updated `src/core/grpc/grpc-client.ts`
- Updated `src/core/worker-agent.ts`

## [0.4.90] - 2025-01-15

### Added Worker-Side Delegated Task Instrumentation
- Added explicit worker logs around delegated task handling to trace where peer-routed `bash` tasks stall
- Logs now cover task start, params/context, tool event forwarding, stream creation, `stream.result` waiting/resolution, completion send, and failure-path handling
- Intended to isolate whether the remaining delegated task bug is in worker execution, gRPC frame emission, or completion reconciliation

### Technical Changes
- Updated `src/core/worker-agent.ts`

## [0.4.89] - 2025-01-15

### Fixed Worker Streaming Bash Timeout Propagation for Delegated Tasks
- Passed `params.timeout` through to the worker streaming bash wrapper so delegated peer-routed `bash` tasks honor requested timeout behavior in the actual execution path
- Targets the remaining delegated-worker `bash` tasks that could remain stuck in `running` when the streaming execution path did not share the caller timeout semantics

### Technical Changes
- Updated `src/utils/worker-tool-executor.ts`

## [0.4.88] - 2025-01-15

### Narrowed Worker Tool-Finished Payloads for Delegated gRPC Task Stability
- Reduced worker `tool_finished` payloads to a sanitized result shape (`success`, `output`, `details`, `error`) instead of forwarding the full execution result object
- Complements the `0.4.87` `task_completed` narrowing so both worker→master result-bearing task frames avoid problematic nested runtime structures
- Aims to improve peer-routed delegated worker `bash` task completion reliability

### Technical Changes
- Updated `src/core/worker-agent.ts`

## [0.4.87] - 2025-01-15

### Narrowed Worker Task Completion Payloads for Delegated Task Stability
- Reduced worker `task_completed` payloads to a sanitized result shape (`success`, `output`, `details`, `error`) instead of forwarding the full execution object structure
- Aims to improve delegated peer-routed task completion reliability and reduce the chance of problematic nested runtime objects interfering with completion delivery or persistence

### Technical Changes
- Updated `src/core/worker-agent.ts`

## [0.4.86] - 2025-01-15

### Fixed Task Registry Persistence for Peer-Routed Worker Tasks
- Added registry-safe task/result sanitization in `agent-server` before persisting task payloads and results
- Prevents circular runtime objects from entering the file registry and causing `Converting circular structure to JSON` failures
- Aims to stop peer-routed worker tasks from getting stuck in `running` due to broken registry/task bookkeeping during soak-style repeated operations

### Technical Changes
- Updated `src/core/agent-server.ts`

## [0.4.85] - 2025-01-15

### Fixed Peer Memory Tool Execution and Connected-Agent Resolution
- Added `agent_memory_show` and `agent_memory_update` to the peer master direct-tool execution path
- Added connected-agent fallback resolution for `agent_memory_show` and `agent_memory_update` so peer-hosted workers can be targeted even when missing from the peer file registry
- Brings peer memory tools in line with the now-working peer persona/chat worker resolution model

### Technical Changes
- Updated peer/master tool support in `src/core/agent-server.ts`
- Updated `src/tools/agentMemoryShow.ts`
- Updated `src/tools/agentMemoryUpdate.ts`

## [0.4.84] - 2025-01-15

### Fixed Rich Peer Worker Inventory to Avoid Circular Task Registry Failures
- Reworked `agent_peer_list_workers` enrichment to avoid nested peer `/task` calls for persona/memory inspection
- Worker inventory now derives workspace from connected worker IDs and reads persona/memory summaries directly from the worker workspace path instead of creating extra peer task records
- Prevents `Converting circular structure to JSON` failures caused by task results capturing live runtime objects during recursive peer inventory enrichment

### Technical Changes
- Simplified `src/tools/agentPeerListWorkers.ts`

## [0.4.83] - 2025-01-15

### Added Peer Memory Tools and Richer Peer Worker Inventory
- Added `agent_peer_memory_show` for inspecting memory summary and recent context on a named worker behind a peer master
- Added `agent_peer_memory_update` for updating memory on a named worker behind a peer master
- Expanded `agent_peer_list_workers` to include richer worker inventory details:
  - workspace
  - persona summary
  - memory summary
  - allowed tools
- Registered the new peer memory tools in the main TUI tool surface

### Technical Changes
- Added `src/tools/agentPeerMemoryShow.ts`
- Added `src/tools/agentPeerMemoryUpdate.ts`
- Enhanced `src/tools/agentPeerListWorkers.ts`
- Updated `src/cli/tui.ts`

## [0.4.82] - 2025-01-15

### Fixed Peer Worker Chat Active gRPC Runtime Resolution
- Peer-executed `agent_chat` now receives the live active master config and gRPC server through request execution context instead of depending solely on the `agentMaster` singleton
- This addresses the `Current session does not have an active gRPC master server instance` failure seen during peer worker chat on remote masters
- Keeps the peer worker chat path aligned with the intended gRPC-first runtime model

### Technical Changes
- Updated `src/core/agent-server.ts` to inject active runtime objects into peer task execution context
- Updated `src/tools/agentChat.ts` to use injected runtime context before falling back to the singleton

## [0.4.81] - 2025-01-15

### Fixed Peer Worker Chat for gRPC-Connected Workers Without HTTP Endpoints
- Updated `agent_chat` so peer-executed remote worker chats no longer require a worker HTTP endpoint or HTTP health check when the worker is already known live via the peer master's gRPC connection
- This moves the peer worker chat path closer to the intended architecture: trust the peer master's live gRPC connectivity for remote workers instead of requiring parallel HTTP endpoint truth

### Technical Changes
- Updated `src/tools/agentChat.ts`

## [0.4.80] - 2025-01-15

### Fixed Peer Worker Chat Connected-Agent Resolution
- Added connected-agent fallback lookup to `agent_chat` for peer-executed remote worker chats
- If the target worker is connected via peer `/agents` but missing from the peer file registry, `agent_chat` now resolves it from the live connected-agent list
- This addresses the remaining `❌ Agent not found: <worker-id>` failure for `agent_peer_chat` with `worker_name`

### Technical Changes
- Updated `src/tools/agentChat.ts`

## [0.4.79] - 2025-01-15

### Fixed Peer Worker Chat Direct Execution and Peer Persona Workspace Targeting
- Fixed peer-executed `agent_chat` to run on the peer master direct-tool path instead of the worker-tool streaming executor
- This addresses the remaining `Tool not supported: agent_chat` failure for `agent_peer_chat` with `worker_name`
- Improved connected-agent fallback workspace targeting for `agent_persona_set` and `agent_persona_show` so peer worker persona operations stop writing into the peer master workspace

### Technical Changes
- Updated direct master tool allowlist in `src/core/agent-server.ts`
- Updated connected-agent fallback workspace handling in `src/tools/agentPersonaSet.ts`
- Updated connected-agent fallback workspace handling in `src/tools/agentPersonaShow.ts`

## [0.4.78] - 2025-01-15

### Fixed Peer Worker Chat Routing and Peer Persona Connected-Agent Resolution
- Fixed `agent_peer_chat` so remote worker chat requests no longer incorrectly route `agent_chat` into the worker tool executor
- Peer worker chat now asks the peer master to execute `agent_chat` directly against the target worker by `agent_id`
- Fixed peer persona set/show for connected remote workers that are present in peer `/agents` but missing from the peer file registry
- Added connected-agent fallback lookup for `agent_persona_set` and `agent_persona_show` during peer-executed remote worker management
- Added honest 404 behavior when a stale `targetAgentId` is provided but the worker is not connected

### Technical Changes
- Updated `src/tools/agentPeerChat.ts`
- Updated `src/tools/agentPeerPersonaSet.ts`
- Updated `src/tools/agentPeerPersonaShow.ts`
- Updated `src/tools/agentPersonaSet.ts`
- Updated `src/tools/agentPersonaShow.ts`
- Updated `src/core/agent-server.ts`

## [0.4.77] - 2025-01-15

### Fixed Peer Persona Worker Resolution and Peer Reply Extraction
- Fixed `agent_peer_persona_set` to resolve remote `worker_name` to `agent_id` before calling remote `agent_persona_set`
- Fixed `agent_peer_persona_show` to resolve remote `worker_name` to `agent_id` before calling remote `agent_persona_show`
- Improved peer result extraction to ignore generic `Task <id> completed` wrappers so inner payloads can surface more truthfully

### Technical Changes
- Updated `src/tools/agentPeerPersonaSet.ts`
- Updated `src/tools/agentPeerPersonaShow.ts`
- Updated `src/tools/agentPeerTaskHelpers.ts`

## [0.4.76] - 2025-01-15

### Fixed Peer Worker Chat Execution Path
- Added `agent_chat` support to the peer master task execution path
- Fixes peer worker chat requests that were returning misleading `Task ... completed` wrappers around inner `Tool not supported: agent_chat` failures
- This is the key fix needed for `agent_peer_chat` with `worker_name` to surface the real worker reply

### Technical Changes
- Updated peer/master task tool support in `src/core/agent-server.ts`
- Expanded supported tool messaging for peer task execution

## [0.4.75] - 2025-01-15

### Fixed Peer Persona Execution Path and Result Fallbacks
- Expanded peer master direct-tool support to include `agent_persona_show` and `agent_persona_set`
- Fixed peer worker chat/persona tools to fall back to final task status snapshots when `/task/:id/result` is empty or thin
- Improved peer result extraction so completed remote chat tasks are more likely to surface the actual worker reply text

### Technical Changes
- Updated peer tool allowlist and direct execution path in `src/core/agent-server.ts`
- Updated `src/tools/agentPeerTaskHelpers.ts` to retain status snapshots and use result fallbacks
- Updated `src/tools/agentPeerChat.ts`
- Updated `src/tools/agentPeerPersonaShow.ts`
- Updated `src/tools/agentPeerPersonaSet.ts`

## [0.4.74] - 2025-01-15

### Fixed Peer Worker Chat and Persona Result Handling
- Fixed `agent_peer_chat` with `worker_name` to wait for peer task completion and return the actual worker reply instead of only a routing acknowledgment
- Fixed `agent_peer_persona_show` result extraction for peer task responses
- Fixed `agent_peer_persona_set` result extraction for peer task responses
- Added shared peer task helpers for worker resolution, polling, and readable result extraction

### Technical Changes
- Added `src/tools/agentPeerTaskHelpers.ts`
- Updated `src/tools/agentPeerChat.ts`
- Updated `src/tools/agentPeerSend.ts` to use shared peer result extraction helpers
- Updated `src/tools/agentPeerPersonaShow.ts`
- Updated `src/tools/agentPeerPersonaSet.ts`

## [0.4.73] - 2025-01-15

### Added Peer Worker Chat and Persona Tools
- `agent_peer_chat` now supports optional `worker_name` to route chat to a named worker behind a registered remote peer master
- Added `agent_peer_persona_show` to inspect persona/memory for a named worker behind a peer master
- Added `agent_peer_persona_set` to write/update persona for a named worker behind a peer master

### Federation UX Expansion
- Remote peer workers can now be treated more like first-class collaborators, not only task targets
- Keeps routing explicit through `peer_name` + `worker_name`

### Technical Changes
- Updated `src/tools/agentPeerChat.ts` to resolve remote workers via peer `/agents`
- Added `src/tools/agentPeerPersonaShow.ts`
- Added `src/tools/agentPeerPersonaSet.ts`
- Registered new peer persona tools in `src/cli/tui.ts`

## [0.4.72] - 2025-01-15

### Added Remote Worker Visibility Tool
- Added `agent_peer_list_workers` to list connected workers behind a registered remote peer master
- This gives a more truthful peer-worker visibility path than asking the remote peer to run registry-based `agent_list`
- Worker visibility now includes:
  - worker name
  - worker id
  - status
  - endpoint

### Technical Changes
- Added `src/tools/agentPeerListWorkers.ts`
- Registered `agent_peer_list_workers` in the main TUI tool surface via `src/cli/tui.ts`

## [0.4.71] - 2025-01-15

### Fixed Peer-Federated Worker Spawn Context
- `agent_spawn_local` now accepts master endpoint from execution context as well as explicit parameters or local in-process master state
- Peer `/task` execution now injects the peer master's local `masterEndpoint` into task context automatically
- This fixes remote peer-master orchestration cases where `agent_spawn_local` could run on the peer master but still fail with `No master endpoint available`

### Technical Changes
- Updated `src/tools/agentSpawnLocal.ts` to use `context.masterEndpoint`
- Updated `src/core/agent-server.ts` to inject `masterEndpoint: http://localhost:<peer-port>` into peer task execution context

## [0.4.70] - 2025-01-15

### Fixed Peer-Master Orchestration Tool Execution
- Selected master orchestration tools now execute directly on the peer master instead of flowing through the worker-only tool executor
- This fixes failures where peer task dispatch could accept orchestration tools like `agent_spawn_local` but then fail with `Tool not supported`
- Direct peer-master execution now applies to:
  - `agent_spawn_local`
  - `agent_list`
  - `agent_cleanup`
  - `agent_master_status`

### Technical Changes
- Updated `src/core/agent-server.ts` so selected master tools bypass `executeToolWithStream(...)` and run through their actual tool definitions during peer task execution

## [0.4.69] - 2025-01-15

### Expanded Peer-Master Federation Support
- Remote peer `/task` execution can now run a first set of master orchestration tools locally on the peer master
- Added peer-master task support for:
  - `agent_spawn_local`
  - `agent_list`
  - `agent_cleanup`
  - `agent_master_status`
- This enables the first real orchestration step for peer-worker federation, such as spawning workers on a remote peer master from another machine

### Technical Changes
- Updated `src/core/agent-server.ts` local task execution path to allow selected master orchestration tools during peer task dispatch
- Preserved existing worker-tool execution support while extending peer-master capabilities in a controlled v1 scope

## [0.4.68] - 2025-01-15

### Added Minimal Peer-Worker Federation
- `agent_peer_send` now supports optional `worker_name`
- When `worker_name` is provided, the caller resolves the named worker on the remote peer master via `/agents`
- Peer task dispatch now forwards `targetAgentId` so the remote peer master can route work to one of its connected workers over gRPC
- Receiver-side peer task summaries now include the intended remote worker when present

### Technical Changes
- Updated `src/tools/agentPeerSend.ts` to support remote worker targeting through peer masters
- Updated `src/core/agent-server.ts` peer task summary/logging to include `remoteWorkerName` when present

## [0.4.67] - 2025-01-15

### Rolled Back Broken Live Peer Terminal Rendering
- Removed automatic peer activity watcher startup from serve mode
- This reverts the attempt to print live receiver-side peer activity directly into the terminal while the managed TUI was active
- The previous approach interfered with the TUI input box and could make the receiving peer session unusable
- Receiver-side peer activity logging groundwork remains in place via `peer-activity.log`, but no live terminal rendering is performed now

### Technical Changes
- Removed automatic observer startup from `src/cli/agent.ts`
- Removed automatic observer startup from `src/tools/agentServe.ts`
- Restored clean headless serve behavior while preserving peer activity logging foundations

## [0.4.66] - 2025-01-15

### Reduced Duplicate Execution Risk For Explicit Commands
- Tightened the main system prompt so explicit operational requests are treated as direct one-shot execution requests
- Added instruction to avoid narrating an action and then performing the same action again
- Added instruction to avoid duplicate tool calls unless intentionally retrying after failure
- Added guidance to prefer short results over conversational preambles for exact execution requests

### Technical Changes
- Updated `src/utils/system-prompt.ts` with stricter execution behavior for exact tool/command/target/port requests

## [0.4.65] - 2025-01-15

### Improved Peer Activity Rendering
- Receiver-side peer activity watcher now writes to `stderr` instead of `stdout`
- This is intended to avoid peer activity lines being injected into the managed TUI input box on the receiving peer
- Peer activity visibility remains always on during serve mode

### Technical Changes
- Updated `src/cli/agent-peer-observer.ts` to emit passive peer activity lines to `stderr`

## [0.4.64] - 2025-01-15

### Simplified Peer Activity Visibility
- Removed the extra `--tui` / `tui: true` requirement for peer activity visibility
- Peer activity visibility is now always enabled when serving an agent/peer master
- Replaced the incorrect model-backed observer session with a passive peer activity watcher
- The receiving peer now prints short live peer activity lines directly from `peer-activity.log` without invoking a model or taking autonomous actions

### Technical Changes
- Simplified `src/cli/agent-peer-observer.ts` into a passive stdout log watcher
- Updated `src/cli/agent.ts` to start peer activity visibility automatically during serve mode
- Updated `src/tools/agentServe.ts` to always start peer activity visibility and removed the temporary `tui` parameter

## [0.4.63] - 2025-01-15

### Fixed Tool-Level Peer Observer Startup
- `agent_serve` now supports `tui: true` so observer mode can be enabled from within Clawx tool calls, not just the raw CLI
- Tool output now reports whether peer observer TUI is enabled or disabled
- This closes the gap where `clawx agent serve --tui` existed but `agent_serve` could not expose the same capability

### Technical Changes
- Updated `src/tools/agentServe.ts` to accept and normalize `tui`
- Wired tool-based `agent_serve` to launch `startPeerObserverTui(...)`
- Added startup peer-activity log entry for tool-launched serve mode

## [0.4.62] - 2025-01-15

### Added Optional Peer Activity Observer TUI
- `clawx agent serve` now supports `--tui` to open a local observer TUI for incoming peer activity
- Incoming peer tasks already recorded in `peer-activity.log` are now surfaced into a lightweight local TUI observer session
- This keeps peer-local observability optional so headless peers can stay quiet while visible peers can show short live activity messages

### Peer Observability
- Incoming peer tasks continue to be logged compactly on the receiving peer
- Receiver-side activity is now available both as:
  - `peer-activity.log`
  - observer TUI custom messages when `--tui` is enabled

## [0.4.61] - 2025-01-15

### Fixed Fresh-Session Tool Awareness
- Main TUI now injects the actual loaded tool surface into the system prompt at session start
- Built-in coding tools are now explicitly included in fresh-session awareness:
  - `read`
  - `write`
  - `edit`
  - `bash`
  - `find`
  - `ls`
  - `grep`
- Clawx agent, peer, SSH, git, search, and extension tools are now surfaced more truthfully to the model before the user mentions them
- Forge mode now also injects its actual available tools at startup:
  - `hf_search`
  - `hf_model_info`
  - `hf_readme`
  - `hf_dataset_search`
  - `forge_write_capability`
  - `forge_list_capabilities`
- Replaced stale hardcoded capability names like `read_file`, `write_file`, `list_dir`, and `run_shell` with the actual canonical tool names used in Clawx sessions

### Technical Changes
- Added runtime tool-prompt entry support to `ClawxConfig`
- Updated `src/cli/tui.ts` to derive fresh-session prompt awareness from the actual loaded main-session tool list
- Updated `src/cli/forge-tui.ts` to derive fresh-session prompt awareness from the actual Forge tool list
- Updated `src/utils/system-prompt.ts` to render a truthful `Available tools you can call in this session` section and corrected stale capability aliases
- Included `agent_cleanup_processes` in the main TUI tool load path and prompt-awareness surface

## [0.4.60] - 2025-01-15

### Added Minimal Peer Task Observability
- `agent_peer_send` now emits compact live progress updates for peer task execution
- Streaming updates are intentionally low-noise and truthful:
  - start
  - running
  - completed / failed / cancelled
- Optional one-line detail is included only for a few useful tool types:
  - `bash` command preview
  - `read` / `write` / `ls` path
  - `search_files` pattern
- This improves peer observability without using model-generated narration or wasting tokens on synthetic status text

### Technical Changes
- Updated `src/tools/agentPeerSend.ts` to emit minimal `onUpdate` partial results for peer task lifecycle visibility
- Added compact detail summarization and duration reporting for peer task completion states

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