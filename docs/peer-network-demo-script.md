# Peer Network Demo Script

A tight, truthful video/demo script for showing off Clawx peer networking without destructive operations.

This is designed to show:
- clean peer-master bring-up
- explicit peer registration
- peer network visibility
- explicit worker targeting
- non-destructive ops-style inspection across Ubuntu and Raspberry Pi
- why the peer network is useful in real life

---

## Demo goal

Show that from one Clawx control plane you can:
- bring a peer network online
- register remote peer masters
- inspect multiple machines
- explicitly target Ubuntu vs Pi
- use peer-hosted workers for safe ops visibility

---

## Part 1 — Show the clean setup path

### On Ubuntu terminal
```bash
clawx agent serve --name ubuntu-master --port 43210 --no-auto-rehydrate
```

### On Pi terminal
```bash
clawx agent serve --name pi-master --port 43215 --no-auto-rehydrate
```

### Narration
> Each remote machine runs a Clawx peer master with a normal shell command. No hidden cluster magic, no auto-discovery assumption.

---

## Part 2 — From Windows, register the peers

Inside Clawx on Windows:

```text
agent_peer_add(name="ubuntu-master", endpoint="http://192.168.1.183:43210")
agent_peer_add(name="pi-master", endpoint="http://192.168.1.198:43215")
```

Then:

```text
agent_master_status(check_health=true)
```

### Narration
> Now Windows is the control plane. It knows about both peer masters and can verify whether they’re actually reachable.

---

## Part 3 — Show that the network is up even before workers

```text
agent_peer_list_workers(peer_name="ubuntu-master")
agent_peer_list_workers(peer_name="pi-master")
```

### Narration
> A peer network can be up even with zero workers connected. The control plane is live first; workers are explicit.

---

## Part 4 — Spawn one safe ops worker on each machine

```text
agent_peer_send(peer_name="ubuntu-master", tool="agent_spawn_local", params={"name":"ubuntu-ops"})
agent_peer_send(peer_name="pi-master", tool="agent_spawn_local", params={"name":"pi-ops"})
```

Then:

```text
agent_peer_list_workers(peer_name="ubuntu-master")
agent_peer_list_workers(peer_name="pi-master")
```

### Narration
> Now I’m explicitly creating one worker on Ubuntu and one on the Pi. This is not fuzzy routing — I choose where the work goes.

---

## Part 5 — Compare memory on both machines

### Ubuntu
```text
agent_peer_send(peer_name="ubuntu-master", worker_name="ubuntu-ops", tool="bash", params={"command":"free -h && echo '---' && grep -E 'MemTotal|MemAvailable' /proc/meminfo"})
```

### Pi
```text
agent_peer_send(peer_name="pi-master", worker_name="pi-ops", tool="bash", params={"command":"free -h && echo '---' && grep -E 'MemTotal|MemAvailable' /proc/meminfo"})
```

### Narration
> From one place I can compare machine memory across peers using the same workflow and the same result shape.

---

## Part 6 — Compare system identity / runtime basics

### Ubuntu
```text
agent_peer_send(peer_name="ubuntu-master", worker_name="ubuntu-ops", tool="bash", params={"command":"hostname && uname -a && echo 'node:' && node -v && echo 'npm:' && npm -v"})
```

### Pi
```text
agent_peer_send(peer_name="pi-master", worker_name="pi-ops", tool="bash", params={"command":"hostname && uname -a && echo 'node:' && node -v && echo 'npm:' && npm -v"})
```

### Narration
> This makes it easy to compare machine role, OS, and runtime versions across boxes.

---

## Part 7 — Look around the filesystem safely

### Ubuntu
```text
agent_peer_send(peer_name="ubuntu-master", worker_name="ubuntu-ops", tool="bash", params={"command":"pwd && echo '---HOME---' && ls -la ~ && echo '---APPS---' && ls -la ~/apps 2>/dev/null || echo no-apps"})
```

### Pi
```text
agent_peer_send(peer_name="pi-master", worker_name="pi-ops", tool="bash", params={"command":"pwd && echo '---HOME---' && ls -la ~ && echo '---APPS---' && ls -la ~/apps 2>/dev/null || echo no-apps"})
```

### Narration
> This is good for ops inventory, home-lab visibility, or just seeing what’s on each machine without SSHing into each one manually.

---

## Part 8 — Show explicit comparison of app folders

If `~/apps` exists on both:

```text
agent_peer_send(peer_name="ubuntu-master", worker_name="ubuntu-ops", tool="ls", params={"path":"/home/dev/apps"})
agent_peer_send(peer_name="pi-master", worker_name="pi-ops", tool="ls", params={"path":"/home/dev/apps"})
```

### Narration
> Same control plane, different targets, explicit results.

---

## Part 9 — Show persona/identity without being gimmicky

Set simple ops personas:

```text
agent_peer_persona_set(peer_name="ubuntu-master", worker_name="ubuntu-ops", role="Ubuntu operations and build inspection worker")
agent_peer_persona_set(peer_name="pi-master", worker_name="pi-ops", role="Raspberry Pi operations and edge inspection worker")
```

Then ask:

```text
agent_peer_chat(peer_name="ubuntu-master", worker_name="ubuntu-ops", message="Briefly summarize what machine you are on and what kind of tasks you should handle.")
agent_peer_chat(peer_name="pi-master", worker_name="pi-ops", message="Briefly summarize what machine you are on and what kind of tasks you should handle.")
```

### Narration
> Workers can keep explicit identity and role context. That’s useful when you want repeated machine-specific behavior without pretending the system is auto-routing everything.

---

## Part 10 — Show why this beats ad hoc remote access

Finish with:

```text
agent_master_status(check_health=true)
agent_peer_list_workers(peer_name="ubuntu-master")
agent_peer_list_workers(peer_name="pi-master")
```

### Closing narration
> So the value of the peer network is: one control plane, explicit machine targeting, real remote execution, and named workers with identity — across Windows, Ubuntu, and Raspberry Pi.

---

## Recommended demo order

If you want it short and punchy:

1. Start Ubuntu/Pi peer masters
2. `agent_peer_add` both
3. `agent_master_status`
4. spawn `ubuntu-ops` and `pi-ops`
5. compare memory
6. compare Node versions / uname
7. inspect `~/apps`
8. optional persona demo
9. close on benefits

That gives a strong 3–6 minute demo.

---

## Best benefits to say on video

Stick to these because they’re true:
- explicit peer-master federation
- one control plane across multiple machines
- real delegated execution
- named peer-hosted workers
- persona and memory for workers
- good for home labs, dev boxes, build machines, and Pi-side ops
- not hidden magic routing — explicit targeting

Avoid saying:
- autonomous swarm
- self-organizing network
- fully automatic distributed intelligence

Because that drifts past what’s actually implemented.
