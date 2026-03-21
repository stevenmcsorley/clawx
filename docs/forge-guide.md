# Forge Guide

Forge is Clawx's extension-building mode. It is designed for researching ideas, exploring HuggingFace models and datasets, and scaffolding new Clawx capabilities as real extension folders under `~/.clawx/extensions/`.

Forge is intentionally narrow: it is for capability discovery and extension creation, not general repo orchestration.

---

## What Forge does

Forge currently gives you a focused toolset for:
- searching HuggingFace models
- inspecting HuggingFace model metadata
- reading HuggingFace model READMEs
- searching HuggingFace datasets
- scaffolding a new Clawx extension
- listing existing Clawx extensions

In practice, that makes Forge useful for:
- exploring model-backed tool ideas
- comparing lightweight inference options
- checking whether a dataset exists for a niche workflow
- scaffolding a real extension folder you can build and enable
- iterating on extension ideas without mixing them into the main orchestration flow

---

## Current Forge toolset

Forge currently exposes these tools:
- `hf_search`
- `hf_model_info`
- `hf_readme`
- `hf_dataset_search`
- `forge_write_capability`
- `forge_list_capabilities`

### What `forge_write_capability` creates

When Forge scaffolds an extension, it creates a folder in `~/.clawx/extensions/<name>/` containing:
- `capability.json`
- `tool.ts`
- `package.json`
- `README.md`

The scaffold is intentionally conservative:
- starts disabled by default
- expects you to inspect the generated code
- gives you a build path instead of pretending the extension is production-ready instantly

---

## What kinds of Clawx tools are good to extend

Forge is most useful when you are building tools that fit the Clawx agent model well.

### 1. Focused specialist tools

These are usually the best fit.

Examples:
- schema validator for a specific file format
- log triage helper for a known application
- changelog summarizer
- config linter for a particular stack
- release-note generator
- lightweight code review assistant for one repo convention
- CSV/JSON/XML transformer for a recurring workflow

Why they work well:
- narrow input/output shape
- clear success criteria
- useful in repeated workflows
- easy to test manually

### 2. Domain helpers for weak model areas

Useful when the base model is weak in a niche area.

Examples:
- COBOL helper tool
- legacy config translator
- mainframe file-format inspector
- industry-specific glossary/normalizer
- domain-specific policy checker

These do not “train the model.” They give Clawx a targeted capability or a targeted reference-backed flow.

### 3. Research-backed inference tools

Examples:
- text classifier using a small HuggingFace model
- sentiment or topic classifier
- image caption helper
- embedding/search preprocessor
- moderation or filtering helper
- OCR post-processor

These are a good fit when:
- the model is lightweight enough to be practical
- the task is narrow and repeatable
- the output can be returned cleanly in a tool result

### 4. Safety and review helpers

Examples:
- risky-command checker
- destructive-action review tool
- dependency-risk summarizer
- file-change impact checker
- secret-leak scan helper

One especially interesting idea is a guard-style MCP or tool layer that only intervenes for potentially hazardous actions rather than slowing down all normal work.

Example concept:
- Clawx remains permissive by default
- a guard tool or MCP inspects a pending action
- only when it detects something notably risky does it ask for confirmation or recommend a stop

That keeps the normal fast Clawx behavior while giving you an optional brake for dangerous cases.

### 5. Integration and bridge tools

Examples:
- ticket system lookup
- build system summarizer
- CI log fetcher
- documentation portal lookup
- metrics snapshot tool
- internal API wrapper
- MCP bridges for systems you want Clawx to reach cleanly

These can be very high-value because they make Clawx useful inside your real environment instead of only inside a repo.

---

## Good MCP ideas for Clawx

MCPs are especially interesting when you want Clawx to gain a reusable external capability without hardwiring it into core.

Examples:
- guard MCP for hazardous actions
- internal docs MCP
- ticketing MCP
- deployment/status MCP
- incident/timeline MCP
- package/license policy MCP
- architecture-reference MCP
- changelog/release coordination MCP

A good MCP for Clawx should usually be:
- explicit
- inspectable
- narrow enough to trust
- useful across repeated workflows

A bad MCP for Clawx would be something vague, overreaching, or so broad that it starts acting like hidden orchestration logic.

---

## HuggingFace opens a lot of options

Forge is powerful partly because HuggingFace gives you a huge search surface for:
- models
- datasets
- task ideas
- lightweight inference building blocks

Useful patterns:
- search for a task first
- inspect candidate models
- read model cards carefully
- check whether the model is realistically small enough or practical enough
- scaffold only after the model/dataset path looks honest

This is especially useful when exploring:
- summarization helpers
- classification tools
- extraction tools
- domain-specific labelers
- multimodal helpers

The key is to stay honest about runtime practicality. A model existing on HuggingFace does not automatically make it a good Clawx capability.

---

## Example Forge prompts

### Discover extension ideas

```text
What are some high-value Clawx extensions I could build for software maintenance workflows?
```

### Explore a model-backed idea

```text
Find lightweight HuggingFace models for classifying bug reports by severity and suggest the best candidates for a Clawx tool.
```

### Explore a domain gap

```text
The base model is weak at COBOL. Use Forge to look for practical HuggingFace models or datasets that could support a narrow COBOL helper tool.
```

### Scaffold a capability

```text
Build a Clawx capability that summarizes CSV files into a concise markdown report.
```

### Design a guard tool

```text
Design a Clawx safety helper that checks for potentially hazardous shell commands and only asks for confirmation when the risk looks significant.
```

### MCP-oriented prompt

```text
Suggest MCPs that would be useful for Clawx in a home-lab or small engineering team environment, and explain which ones are worth building first.
```

---

## What makes a good Forge-built capability

A good extension usually has:
- a narrow job
- a clear output format
- honest runtime expectations
- a build/install path you can verify
- a reason to exist more than once

A weak extension idea is often:
- too broad
- too magical
- too expensive at runtime
- too dependent on hidden assumptions
- too vague about what it returns

---

## Recommended Forge workflow

1. Start with the task, not the model.
2. Decide whether the capability should be:
   - plain code
   - model-backed
   - MCP-backed
   - hybrid
3. Research candidate models/datasets if needed.
4. Read the model card / dataset README.
5. Be honest about size, dependencies, and practicality.
6. Scaffold the capability.
7. Build it locally.
8. Enable it only after inspection/testing.

This keeps Forge grounded instead of turning into speculative code generation.

---

## Things Forge should probably not be used for

Forge is not the best place for:
- broad hidden routing logic
- giant all-purpose “do everything” tools
- extensions that silently take over orchestration
- unsafe code you do not intend to inspect
- capabilities that are really just oversized prompts with no clear interface

If a capability would dominate the whole system or make behavior opaque, it probably belongs in deliberate product design, not as a quick Forge experiment.

---

## Relationship to the main Clawx flow

Forge should stay separate from the main orchestration flow.

That is a feature, not a limitation.

It means:
- your normal Clawx usage stays clean
- extension exploration stays contained
- experimental tools do not dominate ordinary worker/task flow unless you explicitly enable them

This matches the general Clawx design principle:
- explicit beats hidden
- inspectable beats magical
- optional beats dominant

---

## Summary

Forge is best thought of as:
- a capability research surface
- a HuggingFace exploration surface
- an extension scaffold generator
- a place to invent narrow, useful, inspectable Clawx tools

It is especially strong for:
- specialist helpers
- safety/guard ideas
- MCP bridges
- model-backed narrow utilities
- domain-specific capability gaps

Used well, Forge expands what Clawx can do without forcing those experiments into the core product flow until you decide they are worth enabling.
