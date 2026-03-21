# Peer Network Demo Cheat Sheet

```text
 ██████╗██╗      █████╗ ██╗    ██╗██╗  ██╗
██╔════╝██║     ██╔══██╗██║    ██║╚██╗██╔╝
██║     ██║     ███████║██║ █╗ ██║ ╚███╔╝ 
██║     ██║     ██╔══██║██║███╗██║ ██╔██╗ 
╚██████╗███████╗██║  ██║╚███╔███╔╝██╔╝ ██╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝

  Peer Network Demo
  Windows control plane • Ubuntu peer • Raspberry Pi peer
```

## Opening line

> Today I’m showing Clawx peer networking across Windows, Ubuntu, and Raspberry Pi — one control plane, explicit machine targeting, and real delegated execution.

---

## Step 1 — Start peer masters on the remote machines

### Ubuntu terminal
```bash
clawx agent serve --name ubuntu-master --port 43210 --no-auto-rehydrate
```

### Pi terminal
```bash
clawx agent serve --name pi-master --port 43215 --no-auto-rehydrate
```

### Say
> Each remote machine is running a Clawx peer master with a normal shell command. No hidden discovery, no fake swarm behavior, just explicit bring-up.

---

## Step 2 — Register both peers from Windows

```text
agent_peer_add(name="ubuntu-master", endpoint="http://192.168.1.183:43210")
agent_peer_add(name="pi-master", endpoint="http://192.168.1.198:43215")
```

### Say
> Windows is the control plane here. I explicitly register both peer masters so the network is inspectable and predictable.

---

## Step 3 — Show network health

```text
agent_master_status(check_health=true)
```

### Say
> Now I can see both peer masters from one place and verify that they are actually reachable.

---

## Step 4 — Show peers before workers

```text
agent_peer_list_workers(peer_name="ubuntu-master")
agent_peer_list_workers(peer_name="pi-master")
```

### Say
> The peer network is already live even before I attach workers. Workers are explicit — they don’t just magically appear.

---

## Step 5 — Spawn one ops worker on each peer

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
> Now I’m explicitly creating one worker on Ubuntu and one on the Pi. This is controlled targeting, not fuzzy mention-routing.

---

## Step 6 — Compare memory across machines

### Ubuntu
```text
agent_peer_send(peer_name="ubuntu-master", worker_name="ubuntu-ops", tool="bash", params={"command":"free -h && echo '---' && grep -E 'MemTotal|MemAvailable' /proc/meminfo"})
```

### Pi
```text
agent_peer_send(peer_name="pi-master", worker_name="pi-ops", tool="bash", params={"command":"free -h && echo '---' && grep -E 'MemTotal|MemAvailable' /proc/meminfo"})
```

### Say
> From one control plane I can compare machine memory across both peers using the same workflow and the same result shape.

---

## Step 7 — Compare machine/runtime identity

### Ubuntu
```text
agent_peer_send(peer_name="ubuntu-master", worker_name="ubuntu-ops", tool="bash", params={"command":"hostname && uname -a && echo 'node:' && node -v && echo 'npm:' && npm -v"})
```

### Pi
```text
agent_peer_send(peer_name="pi-master", worker_name="pi-ops", tool="bash", params={"command":"hostname && uname -a && echo 'node:' && node -v && echo 'npm:' && npm -v"})
```

### Say
> This makes it easy to compare what each machine actually is, what it is running, and how it differs from the other one.

---

## Step 8 — Look around safely

### Ubuntu
```text
agent_peer_send(peer_name="ubuntu-master", worker_name="ubuntu-ops", tool="bash", params={"command":"pwd && echo '---HOME---' && ls -la ~ && echo '---APPS---' && ls -la ~/apps 2>/dev/null || echo no-apps"})
```

### Pi
```text
agent_peer_send(peer_name="pi-master", worker_name="pi-ops", tool="bash", params={"command":"pwd && echo '---HOME---' && ls -la ~ && echo '---APPS---' && ls -la ~/apps 2>/dev/null || echo no-apps"})
```

### Say
> This is the ops side of peer networking — quick inventory, safe inspection, and explicit machine visibility without bouncing between separate terminals.

---

## Step 9 — Optional persona moment

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

## Closing line

> So the value of Clawx peer networking is simple: one control plane, explicit machine targeting, real delegated execution, and named workers with identity across Windows, Ubuntu, and Raspberry Pi.

---

## On-screen benefit bullets

```text
• one control plane
• explicit targeting
• real remote execution
• named peer-hosted workers
• persona and memory
• good for home labs, dev boxes, build machines, and Pi-side ops
```
