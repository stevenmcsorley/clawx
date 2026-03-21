# Peer Network Demo Fancy Script

A more visual, presenter-friendly version of the peer-network demo with ASCII splash screens, topology cards, step banners, and closing benefit cards.

---

## Opening splash

```text
 ██████╗██╗      █████╗ ██╗    ██╗██╗  ██╗
██╔════╝██║     ██╔══██╗██║    ██║╚██╗██╔╝
██║     ██║     ███████║██║ █╗ ██║ ╚███╔╝
██║     ██║     ██╔══██║██║███╗██║ ██╔██╗
╚██████╗███████╗██║  ██║╚███╔███╔╝██╔╝ ██╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝

        Peer Network Demo
  Windows • Ubuntu • Raspberry Pi
```

### Say
> Today I’m showing Clawx peer networking across Windows, Ubuntu, and Raspberry Pi — one control plane, explicit machine targeting, and real delegated execution.

---

## Network topology card

```text
                 ┌──────────────────────┐
                 │   Windows Control    │
                 │       Plane          │
                 │      (Clawx)         │
                 └──────────┬───────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              │                           │
   ┌──────────▼──────────┐     ┌──────────▼──────────┐
   │    Ubuntu Peer      │     │      Pi Peer        │
   │      Master         │     │       Master        │
   │     :43210          │     │      :43215         │
   └──────────┬──────────┘     └──────────┬──────────┘
              │                           │
   ┌──────────▼──────────┐     ┌──────────▼──────────┐
   │    ubuntu-ops       │     │       pi-ops        │
   │   peer worker       │     │    peer worker      │
   └─────────────────────┘     └─────────────────────┘
```

### Say
> The design is explicit: Windows is the control plane, Ubuntu and Pi are peer masters, and workers are created intentionally where I want the work to happen.

---

## Step 1 — Bring up peer masters

```text
╔══════════════════════════════════════════════════════╗
║ STEP 1 — BRING UP PEER MASTERS                      ║
╚══════════════════════════════════════════════════════╝
```

### Ubuntu terminal
```bash
clawx agent serve --name ubuntu-master --port 43210 --no-auto-rehydrate
```

### Pi terminal
```bash
clawx agent serve --name pi-master --port 43215 --no-auto-rehydrate
```

### Say
> Each remote machine is started with a normal shell command. No hidden discovery, no fantasy cluster layer.

---

## Step 2 — Register peers from Windows

```text
╔══════════════════════════════════════════════════════╗
║ STEP 2 — REGISTER PEERS FROM WINDOWS                ║
╚══════════════════════════════════════════════════════╝
```

```text
agent_peer_add(name="ubuntu-master", endpoint="http://192.168.1.183:43210")
agent_peer_add(name="pi-master", endpoint="http://192.168.1.198:43215")
agent_master_status(check_health=true)
```

### Say
> From Windows I register both peers explicitly, then verify they are really reachable.

---

## Step 3 — Show the network before workers

```text
╔══════════════════════════════════════════════════════╗
║ STEP 3 — PEER NETWORK BEFORE WORKERS                ║
╚══════════════════════════════════════════════════════╝
```

```text
agent_peer_list_workers(peer_name="ubuntu-master")
agent_peer_list_workers(peer_name="pi-master")
```

### Say
> The peer network is alive even before any workers are attached.

---

## Step 4 — Spawn one ops worker on each peer

```text
╔══════════════════════════════════════════════════════╗
║ STEP 4 — SPAWN OPS WORKERS                          ║
╚══════════════════════════════════════════════════════╝
```

```text
agent_peer_send(peer_name="ubuntu-master", tool="agent_spawn_local", params={"name":"ubuntu-ops"})
agent_peer_send(peer_name="pi-master", tool="agent_spawn_local", params={"name":"pi-ops"})
```

Then:

```text
agent_peer_list_workers(peer_name="ubuntu-master")
agent_peer_list_workers(peer_name="pi-master")
```

### Say
> Now I’m explicitly creating one worker on Ubuntu and one on the Pi. That keeps targeting obvious and inspectable.

---

## Step 5 — Compare machine memory

```text
╔══════════════════════════════════════════════════════╗
║ STEP 5 — COMPARE MACHINE MEMORY                     ║
╚══════════════════════════════════════════════════════╝
```

### Ubuntu
```text
agent_peer_send(peer_name="ubuntu-master", worker_name="ubuntu-ops", tool="bash", params={"command":"free -h && echo '---' && grep -E 'MemTotal|MemAvailable' /proc/meminfo"})
```

### Pi
```text
agent_peer_send(peer_name="pi-master", worker_name="pi-ops", tool="bash", params={"command":"free -h && echo '---' && grep -E 'MemTotal|MemAvailable' /proc/meminfo"})
```

### Optional visual card after results

```text
┌──────────────────────── MEMORY SNAPSHOT ────────────────────────┐
│ Ubuntu: 11 GiB total • 6.2 GiB available                        │
│ Pi:      7.7 GiB total • 6.9 GiB available                      │
│                                                                  │
│ Same workflow • different machines • explicit targeting          │
└──────────────────────────────────────────────────────────────────┘
```

### Say
> From one control plane I can compare machine memory across both peers with the same workflow and result format.

---

## Step 6 — Compare runtime / machine identity

```text
╔══════════════════════════════════════════════════════╗
║ STEP 6 — COMPARE RUNTIME / MACHINE IDENTITY         ║
╚══════════════════════════════════════════════════════╝
```

### Ubuntu
```text
agent_peer_send(peer_name="ubuntu-master", worker_name="ubuntu-ops", tool="bash", params={"command":"hostname && uname -a && echo 'node:' && node -v && echo 'npm:' && npm -v"})
```

### Pi
```text
agent_peer_send(peer_name="pi-master", worker_name="pi-ops", tool="bash", params={"command":"hostname && uname -a && echo 'node:' && node -v && echo 'npm:' && npm -v"})
```

### Optional visual card

```text
┌──────────────────── SYSTEM IDENTITY ────────────────────┐
│ Ubuntu: x86_64 • Ubuntu • Node 22.22.1 • npm 10.9.4     │
│ Pi:     ARM64  • Ubuntu • Node 22.22.1 • npm 10.9.4     │
└──────────────────────────────────────────────────────────┘
```

### Say
> This makes it easy to compare what each machine actually is and what runtime it is carrying.

---

## Step 7 — Safe ops inventory

```text
╔══════════════════════════════════════════════════════╗
║ STEP 7 — SAFE OPS INVENTORY                         ║
╚══════════════════════════════════════════════════════╝
```

### Ubuntu
```text
agent_peer_send(peer_name="ubuntu-master", worker_name="ubuntu-ops", tool="bash", params={"command":"pwd && echo '---HOME---' && ls -la ~ && echo '---APPS---' && ls -la ~/apps 2>/dev/null || echo no-apps"})
```

### Pi
```text
agent_peer_send(peer_name="pi-master", worker_name="pi-ops", tool="bash", params={"command":"pwd && echo '---HOME---' && ls -la ~ && echo '---APPS---' && ls -la ~/apps 2>/dev/null || echo no-apps"})
```

### Say
> This is where peer networking becomes immediately useful for ops: inventory, safe inspection, and cross-machine visibility without bouncing around multiple terminals.

---

## Optional persona step

```text
╔══════════════════════════════════════════════════════╗
║ OPTIONAL — PERSONA / IDENTITY                       ║
╚══════════════════════════════════════════════════════╝
```

```text
agent_peer_persona_set(peer_name="ubuntu-master", worker_name="ubuntu-ops", role="Ubuntu operations and build inspection worker")
agent_peer_persona_set(peer_name="pi-master", worker_name="pi-ops", role="Raspberry Pi operations and edge inspection worker")
```

Then:

```text
agent_peer_chat(peer_name="ubuntu-master", worker_name="ubuntu-ops", message="Briefly summarize what machine you are on and what kind of tasks you should handle.")
agent_peer_chat(peer_name="pi-master", worker_name="pi-ops", message="Briefly summarize what machine you are on and what kind of tasks you should handle.")
```

### Say
> Workers can keep identity and role context, which makes repeated cross-machine workflows clearer without pretending the system is doing hidden autonomous routing.

---

## Closing benefits card

```text
┌──────────────────── WHY PEER NETWORKING MATTERS ───────────────────┐
│ • one control plane                                                │
│ • explicit machine targeting                                       │
│ • real remote execution                                            │
│ • named peer-hosted workers                                        │
│ • persona and memory when needed                                   │
│ • great for home labs, build boxes, and edge devices               │
└─────────────────────────────────────────────────────────────────────┘
```

### Closing line
> So the value of Clawx peer networking is simple: one control plane, explicit machine targeting, real delegated execution, and named workers with identity across Windows, Ubuntu, and Raspberry Pi.

---

## Presenter notes

Lean into:
- explicit
- real
- cross-machine
- one control plane
- peer-hosted workers

Avoid saying:
- swarm
- autonomous mesh
- self-organizing intelligence

because the product is strongest when presented truthfully.
