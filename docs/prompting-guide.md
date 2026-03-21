# Prompting Guide

This guide shows how to prompt Clawx clearly when you want it to manage local workers, peer masters, and multi-machine setups.

Clawx works best when you describe:
- the desired end state
- the machines involved
- whether it may repair/restart/update as needed
- how much verification you want
- whether you want a generic flow or a specific known worker

---

## General prompting style

Good prompts usually include:
- the desired end state
- the machines involved
- whether Clawx should repair/restart/update as needed
- a request to verify the final state

Clawx works best when you describe the operational goal directly instead of naming every low-level step unless you specifically want exact control.

### Strong default pattern

A strong management prompt often follows this structure:

1. State the target environment
2. State the desired healthy end state
3. Allow repair/update/restart if needed
4. Require verification
5. Ask for a concise final report

That gives Clawx room to act agentically without making the goal ambiguous.

---

## Peer network management

### Restore a Windows + Ubuntu + Pi peer network

Use a prompt like this in a fresh session:

```text
Bring my Clawx peer network into a healthy working state across Windows, Ubuntu, and Pi. Ensure this machine is the main master, ensure Ubuntu and Pi peer masters are running and reachable, register any missing peers, repair unhealthy ones if needed, verify health, and then show me the final network state.
```

This works well because it tells Clawx:
- what the final state should be
- that it may repair missing or unhealthy pieces
- that it must verify the result instead of only attempting the setup

### Short version

```text
Restore my Windows/Ubuntu/Pi Clawx peer network and verify it. Be concise.
```

### Include updates

```text
Bring my Clawx peer network into a working state across Windows, Ubuntu, and Pi. Update remote machines if needed, restart peer masters if needed, register missing peers, verify health, and show me the final network state.
```

### Health-first version

```text
Audit my Clawx peer network across Windows, Ubuntu, and Pi. Identify what is healthy, what is missing, repair what needs repair, verify everything again, and then give me a concise final status.
```

### Restart-and-recover version

```text
Recover my Clawx network after restart. Make sure the Windows master is healthy, make sure Ubuntu and Pi peer masters are reachable, let auto-rehydration settle, verify workers, and summarize the final state.
```

### Minimal-interruption version

```text
Check my Windows, Ubuntu, and Pi Clawx peer network. Only change what is necessary to get it healthy, verify the final result, and keep the report short.
```

---

## Worker targeting and delegation

### Use a specific worker explicitly

When you want a known worker, say so directly:

```text
Use the worker frontend-dev to inspect this project and propose a patch.
```

This keeps worker choice explicit and avoids hidden routing behavior.

### Use a peer worker explicitly

```text
Use the Ubuntu worker build-box-1 to inspect the repo, run the failing script, patch the issue, rerun it, and summarize the result.
```

### Use a generic worker flow

If you do not care which worker is used, just describe the task:

```text
Inspect the Ubuntu repo, patch the failing script, run it, and summarize what changed.
```

### Have Clawx create a worker and use it

```text
Create a temporary Ubuntu worker for debugging this project, inspect the repo, run the broken command, patch the problem, test it again, and tell me exactly what changed.
```

### Have Clawx create several workers for parallel roles

```text
Create three local workers: one for repo inspection, one for patching, and one for test verification. Use them to diagnose the issue, apply a fix, verify it, and then give me a final summary.
```

### Ask for a temporary worker only

```text
Spawn a temporary worker for this task, use it to inspect and patch the repo, then leave me with the results.
```

### Ask to preserve a worker for reuse

```text
Create a worker for frontend patching, keep it around after the task, and tell me its name so I can reuse it later.
```

---

## Repo inspection and repair

### Inspect only

```text
Inspect this repository and tell me what it does, how it is structured, and where the likely failure points are. Do not change anything.
```

### Inspect + patch + verify

```text
Inspect this repo, find the bug in the startup flow, patch it, run the relevant verification step, and summarize the exact fix.
```

### Minimal-diff repair

```text
Fix the issue with the smallest possible code change, verify it, and explain the exact diff in plain language.
```

### Aggressive repair

```text
Get this project into a working state. Make whatever code, file, dependency, and config changes are necessary, then verify the final result.
```

### Read-only audit

```text
Audit this repo for likely bugs, stale docs, and broken scripts. Do not modify files. Report findings only.
```

### Patch after explanation

```text
First explain the likely problem in this repo, then fix it, then verify the fix, then summarize the final state.
```

### Patch without overexplaining

```text
Just fix the bug, test it, and report the result briefly.
```

---

## Remote machine management

### Check a remote machine

```text
Inspect the Ubuntu machine, verify Clawx is healthy there, inspect the repo, and report anything broken.
```

### Update a remote machine

```text
Update Clawx on Ubuntu, restart the peer master if needed, verify health, and show me the final status.
```

### Bring a remote machine into service

```text
Bring the Pi back into the Clawx peer network. Make sure the peer master is running, verify reachability, and show me the final status.
```

### Remote cleanup

```text
Clean up stale workers and stale processes on Ubuntu, preserve anything rehydratable, verify the peer master is still healthy, and summarize what was removed.
```

### Remote lifecycle audit

```text
Audit Ubuntu worker lifecycle state: running workers, preserved historical workers, cleanup state, and rehydration readiness. Report the result clearly.
```

---

## Rehydration and lifecycle prompts

### Explicit rehydration

```text
Rehydrate the persisted workers owned by the current master, verify which ones came back successfully, and tell me which ones failed.
```

### Named rehydration

```text
Rehydrate only the worker named ubuntu-rehydrate-target, verify it is healthy, and then run a simple command through it.
```

### Restart-and-continue flow

```text
After master restart, confirm which workers auto-rehydrated successfully, verify they are usable, and show me any that still need manual attention.
```

### Cleanup without harming persistence

```text
Clean up stale dead workers, but preserve auto-start workers that should remain rehydratable. Then show me the resulting worker inventory.
```

---

## Worker identity, persona, and memory

### Create a specialist worker

```text
Create a worker for frontend patching, give it a concise persona focused on React and TypeScript UI work, set a short reusable memory summary, and tell me the worker name when done.
```

### Improve a worker for a narrow role

```text
Refine the worker docs-editor so it behaves like a concise technical documentation editor. Update its persona and memory, but keep the changes lightweight.
```

### Inspect a worker identity

```text
Show me the persona and memory for the worker frontend-dev and tell me whether its current specialization still makes sense.
```

### Reset a worker mentally

```text
Clear out the stale specialization on this worker by replacing its memory summary and simplifying its persona back to a more general coding assistant.
```

### Preserve a worker but narrow its role

```text
Keep this worker, but tighten its persona so it only focuses on build/debug tasks and not broad coding changes.
```

---

## Domain-specific worker improvement

These are especially useful when a base model is weak in a niche domain.

### COBOL example

```text
Create a worker for COBOL maintenance. Give it a concise persona for careful legacy-system editing, add a compact memory summary about being conservative with COBOL changes, and tell me what docs or examples it should consult when needed.
```

### Frontend style guide example

```text
Prepare a persistent frontend worker for this project. It should follow our React/TypeScript style guide, prefer existing UI patterns, and keep changes minimal. Keep the worker lightweight and rely on docs only when needed.
```

### Ops/runbook example

```text
Set up a persistent ops worker for Ubuntu maintenance. Give it a practical operations persona, keep the memory concise, and point it toward the machine-specific docs and scripts it should consult when needed.
```

### Domain audit before specialization

```text
This worker seems weak at COBOL tasks. Inspect what reference material exists in the repo, suggest how to improve the worker without bloating its prompt, and then apply a lightweight specialization if it makes sense.
```

---

## Multi-step coding and patch workflows

### Build something from scratch

```text
Create a small CLI tool in this repo that reads a JSON file and prints a formatted summary. Build it, test it, and explain what files were added.
```

### Add a feature

```text
Add a health endpoint to this service, wire it into the existing server structure, run the relevant verification step, and summarize the exact change.
```

### Refactor carefully

```text
Refactor this module for clarity without changing behavior. Keep the diff small, verify it still works, and summarize the structural improvements.
```

### Compare options before changing code

```text
Inspect the current implementation, propose two small fix options, choose the safer one, implement it, and verify the result.
```

### Hard-mode debugging

```text
Find out why this program fails only after restart, trace the exact root cause, fix it, verify the fix, and report only things you actually observed.
```

---

## Conversation and collaboration prompts

### Ask a worker to explain prior work

```text
Use the worker ubuntu-patcher and ask it to summarize what it changed, what it observed, and what command output it got most recently.
```

### Force a concise answer

```text
Use the worker build-box-1, inspect the issue, and return exactly three bullet points: root cause, fix, and verification result.
```

### Ask for debate or synthesis

```text
Have two workers take different positions on the best fix, then synthesize their arguments into one recommendation.
```

### Ask for one worker to critique another worker's output

```text
Use worker docs-editor to critique the summary produced by worker backend-dev, then rewrite the summary more clearly.
```

---

## Prompt patterns for operational control

### Concise operational request

```text
Restart the Ubuntu peer master, verify health, and report the final state briefly.
```

### Exact-worker request

```text
Use worker george-beatle only. Ask it for a revised bridge lyric and nothing else.
```

### Verify-before-claiming request

```text
Do not assume anything. Check the actual health, process state, and worker visibility first, repair only what is necessary, and then report the verified result.
```

### Do-not-change-anything request

```text
Inspect the current state only. Do not restart, patch, clean up, or modify anything unless I ask.
```

### Change-as-needed request

```text
Do whatever is necessary to get this system healthy again, then verify and summarize the final state.
```

---

## Creative and unusual uses

These are less about infrastructure and more about stretching the orchestration model in interesting ways.

### Create a temporary writing group

```text
Create four temporary workers with different songwriting personas, have them collaboratively draft an original song, then summarize the final result and clean them up afterward.
```

### Run a mock design review

```text
Create three workers with different viewpoints—product, engineering, and operations—and have them critique a proposed architecture, then synthesize the final recommendation.
```

### Simulate a cautious maintainer vs aggressive fixer

```text
Create two workers: one conservative maintainer and one aggressive fixer. Have both inspect the bug, argue for their approach, then give me the safer final plan.
```

### Build a temporary committee and dissolve it

```text
Create a small team of temporary workers for brainstorming, use them to generate options, pick the best answer, then clean them up when the task is done.
```

---

## Try these out

These prompts are more experimental, but still fit Clawx well.

### Ask Clawx to design a reusable worker pool

```text
Design a small reusable worker pool for this project. Suggest worker names, roles, personas, and when each one should be used explicitly.
```

### Ask Clawx to identify what should become a specialist worker

```text
Look at the kinds of tasks I keep doing in this repo and suggest which ones are worth giving their own persistent worker identity.
```

### Ask Clawx to slim down a problematic worker

```text
This worker has become too noisy and unfocused. Inspect its persona and memory, simplify them, and explain what you removed.
```

### Ask Clawx to retire a worker safely

```text
Retire the worker cobol-maintainer. Disable its persistence, preserve anything worth reviewing, and remove it from normal use.
```

### Ask Clawx to compare ephemeral vs persistent workers for a task

```text
For this task, tell me whether a fresh generic worker or a persistent specialist worker would be the better fit, and explain why briefly.
```

---

## Recommended rules of thumb

- If you care which worker is used, say so explicitly.
- If you want Clawx to repair/update/restart things, say so directly.
- If you only want inspection, say “do not change anything.”
- If you want trustworthy results, ask it to verify before reporting.
- If you want low chatter, say “be concise.”
- If you want a specialist worker, keep the request explicit rather than expecting hidden routing.
- If you want a reusable worker, ask Clawx to preserve it and tell you its name.

That keeps Clawx agentic without making the goal ambiguous.
