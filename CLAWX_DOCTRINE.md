# Clawx Doctrine

## What Clawx is

Clawx is not just a coding agent.

Clawx is a small, stable core that helps users build, run, evolve, and share their own capability packages, automations, workflows, and operating layers.

People should not just use Clawx. They should be able to evolve their own version of it and share those evolutions.

## Core product truth

The core of Clawx must stay small and stable.

Everything else should prefer to live in user space as a capability package, extension, workflow, sidecar, or automation layer.

If a feature can be an extension, it should not be added to core by default.

## The three-layer model

### 1. Core

Core is protected, lean, and dependable.

Core should provide:
- runtime
- tool loading
- extension loading
- session handling
- configuration
- safety boundaries
- package discovery and status
- Forge as the builder

Core should not become a dumping ground for every clever idea.

### 2. Personal capability space

This is where users build their own world.

A user should be able to create:
- tools
- automations
- schedulers
- research systems
- adapters
- local services
- sidecars
- background jobs
- monitoring systems
- briefings
- memory systems
- personal operating layers

These should live in user space, not inside core.

### 3. Shared ecosystem

Users should be able to publish what they build and others should be able to install it.

The shareable unit is a capability package, not random loose files.

That package should be self-contained and GitHub-friendly.

## The shareable package rule

Every capability package should be a self-contained folder.

**Minimum shape:**
- `capability.json`
- `README.md`
- implementation files

**Optional:**
- examples
- tests
- dependency notes
- lockfile
- assets

A package should be understandable, movable, clonable, and removable without touching Clawx core.

## Stability rule

Core must survive broken packages.

If a capability:
- is missing
- is invalid
- has bad dependencies
- fails to load
- conflicts with another package

then Clawx should warn, skip it, and continue.

Broken extensions must never make the base product unusable.

## Merge rule

Keep merging simple.

- If names differ, both can exist.
- If names clash, the user must choose, rename, or reject.
- If dependencies clash, Clawx warns and does not guess.
- If a package is invalid, Clawx skips it and reports why.

Simple rules beat clever merge magic.

## Forge's role

Forge is not a brainstorm bot.
Forge is not a repo vandal.
Forge is not a random project generator.

Forge exists to create clean capability packages in user space that fit the Clawx contract.

Forge should:
- choose the smallest practical implementation path
- create exactly one package per request
- stay inside the extension/package contract
- be honest about what is real, stubbed, or not yet workable
- optimise for a clean first build
- avoid fluff, drift, and overclaiming

Forge should help users grow their tool universe, not spray files everywhere.

## Implementation choice principle

For any requested capability, choose the smallest practical path:

1. **Plain code or small library** - For deterministic tasks
2. **Small specialist asset** - For practical ML tasks (< 100MB)
3. **Current Clawx model/provider** - For creative/reasoning tasks
4. **Scaffold only** - If the real path is not honestly workable yet

Do not use heavyweight models for simple tasks.
Do not fake a model-based implementation with bad heuristics.
Do not silently downshift into hidden fallback behavior.

One package should have one primary implementation path.

## Sharing principle

GitHub should be a first-class sharing surface.

Users should be able to:
- publish one capability as one repo
- publish many capabilities in one repo
- clone a package into their Clawx extensions directory
- later install through a lightweight Clawx install flow

This should feel like sharing evolutions of Clawx, not just sharing snippets.

## Product principle

Clawx should grow outward, not inward.

That means:
- core gets better by becoming more reliable
- ecosystem gets bigger by users building on top
- value comes from the growing user tool universe
- the product becomes stronger because users can shape it to their life and work

## The long-term vision

A user should be able to ask Clawx to build:
- a research system
- a market watcher
- an infrastructure monitor
- a briefing engine
- a lead pipeline
- a scientific co-pilot
- a cron-driven work loop
- a personal intelligence layer
- a company-in-a-box
- an anomaly fusion system
- a domain-specific operating layer

Clawx should help them do that without bloating core and without collapsing into chaos.

## The one-line test

When deciding what to build, ask:

**Does this strengthen the small-core + user-package + shareable-ecosystem model?**

If yes, it fits.
If no, it probably belongs outside core.

## Final line

Clawx is a platform for building personal tool universes.

Not just an agent.
Not just a coding assistant.
A base layer users can evolve, own, and share.