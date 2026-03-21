# Current Capabilities

This document summarizes the currently proven Clawx capabilities after the gRPC-first transport migration and peer-worker federation stabilization work.

## Proven Runtime Topology

Clawx currently supports:
- Windows master orchestration
- Ubuntu peer master + peer-hosted workers
- Raspberry Pi peer master + peer-hosted workers
- explicit LAN peer-master federation
- gRPC as the canonical live master↔worker transport

Peer masters are explicitly registered and targeted by tool use. Collaboration is tool-driven, not heuristic mention-routing.

## Proven Working Capabilities

### Peer master federation
Working:
- register peer masters
- send tasks to peer masters
- send chat to peer masters
- inspect peer worker inventory

Tools:
- `agent_peer_add`
- `agent_peer_send`
- `agent_peer_chat`
- `agent_peer_list_workers`

### Peer-hosted worker lifecycle
Working:
- spawn workers behind peer masters
- resolve peer workers by `worker_name`
- target peer workers for delegated execution
- truthful spawn failure when startup does not actually succeed

Tools:
- `agent_peer_send(..., tool="agent_spawn_local")`
- `agent_peer_list_workers`

Notes:
- workers are still ephemeral after master restart
- spawn success now requires the responding `/health` endpoint to match the newly spawned worker ID

### Peer worker chat / identity / memory
Working on fresh runtimes:
- peer worker chat
- persona set/show
- memory update/show
- worker workspace targeting for these files

Tools:
- `agent_peer_chat`
- `agent_peer_persona_set`
- `agent_peer_persona_show`
- `agent_peer_memory_update`
- `agent_peer_memory_show`

Proven worker workspace artifacts:
- `agent-config.json`
- `persona.json`
- `memory.json`
- `conversation-log.jsonl`

### Peer-routed worker tool execution
Working in fresh real tests:
- `bash`
- `read`
- `write`
- `edit`
- `ls`

Representative validated flows:
- delegated `bash` completion on Ubuntu and Pi
- file create/edit/read/delete on Ubuntu and Pi
- remote worker filesystem inspection via `ls` and `read`

### Truthful task/reporting behavior
Working:
- delegated worker tasks complete instead of sticking in `running` for the previously failing gRPC context-serialization case
- worker-side stdout/stderr can be persisted to `worker.log`
- peer task status is based on real runtime behavior, not fake simulated lifecycle logic

## Most Important Recently Fixed Issues

### Delegated peer-routed worker `bash` tasks stuck in `running`
This was traced to circular runtime objects being injected into master→worker gRPC task payloads.

Fixed by:
- sanitizing delegated `task_started` payloads before gRPC send
- removing circular/non-serializable runtime objects from the live task payload path

Result:
- fresh delegated `bash` tasks now complete successfully on Ubuntu and Pi

### False-positive worker spawn success on reused busy ports
This was exposed during Pi soak work.

Fixed by:
- verifying that `/health` belongs to the newly spawned worker ID
- detecting early spawned-process exit during startup verification

Result:
- spawn truth is now honest when a selected worker port is already occupied

## Practical Use Cases

### 1. Remote build/test/debug worker
Use Ubuntu as a remote build or debugging worker:
- spawn a worker
- run `bash`
- inspect files with `ls` / `read`
- patch files with `write` / `edit`

### 2. Remote Pi ops/config worker
Use Pi as a lightweight LAN-side worker to:
- inspect config and files
- run commands locally on the Pi
- update scripts or small config files
- keep role context via persona/memory

### 3. Cross-machine repository inspection
From one master, inspect remote repos/environments using:
- `ls`
- `read`
- `find`
- `grep`
- `search_files`
- `git_status`
- `git_diff`

### 4. Remote file CRUD workflows
Now proven end-to-end on Ubuntu and Pi:
- create a file
- edit it
- read it back
- delete it

This makes remote patching/scaffolding/config editing realistic and repeatable.

## Current Constraints / Caveats

### Workers are still ephemeral
Remote workers do not yet automatically survive or rehydrate across peer-master restart.

### Port collisions can still happen
Spawn truth is now fixed, but stale occupied worker ports can still require:
- retry
- cleanup
- explicit port selection

### Extra diagnostic instrumentation is still present
This is currently useful for validation and soak work, but may be reduced later for quieter normal operation.

## Current Stability Summary

Currently proven in fresh real runs:
- Windows ↔ Ubuntu peer federation
- Windows ↔ Pi peer federation
- peer worker spawn
- peer worker chat
- peer worker persona set/show
- peer worker memory update/show
- peer-routed worker `bash`
- peer-routed worker `read`
- peer-routed worker `write`
- peer-routed worker `edit`
- peer-routed worker `ls`
- file create/edit/read/delete on Ubuntu and Pi

## Recommended Next Steps

1. Reduce temporary instrumentation/log noise now that the critical delegated-task bug is fixed.
2. Continue small soak passes across a slightly broader worker tool set.
3. Implement worker persistence/autostart/rehydration.
4. Keep spawn/port-selection behavior under watch on Pi and Ubuntu.
