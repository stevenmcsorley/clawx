# Programmatic Usage

Clawx is not only a CLI. It can also be used programmatically from Node.js as an npm package.

That means you can install Clawx inside another app and use it for:
- headless coding tasks
- CI/codegen workflows
- multi-turn agent sessions
- backend automation
- internal tooling
- app-managed AI execution flows

Clawx's current programmatic story is strongest in headless agent execution. The newer master/worker/peer runtime is real and usable through the product, but it is not yet documented as a polished public SDK surface in the same way.

So the honest position is:
- **yes**, Clawx can be used programmatically today
- **yes**, there are existing examples in the repo
- **not yet**, every runtime/federation feature is packaged as a stable public SDK contract

---

## What is already exported

Clawx currently exports a real programmatic API from `@halfagiraf/clawx` including:
- `loadConfig`
- `runAgent`
- `resolveModel`
- `createSessionId`
- `saveSession`
- `loadSession`
- `listSessions`
- `getLatestSession`
- `createStreamRenderer`
- `buildSystemPrompt`
- `buildChatPrompt`
- `log`

It also exports tool factories such as:
- `createSshRunTool`
- `createGitStatusTool`
- `createGitDiffTool`
- `createSearchFilesTool`

---

## Current best-fit programmatic use cases

### 1. Headless task execution

Use Clawx like a coding worker inside a script or service.

Examples:
- generate files
- patch a repo
- run a coding/refactor task
- inspect a workspace and summarize it
- automate codegen in CI

### 2. Multi-turn scripted sessions

Keep message history across several prompts and build incrementally.

Examples:
- scaffold app → patch app → add tests
- inspect repo → propose plan → implement plan
- generate docs over multiple turns

### 3. App backend integration

A backend service can use Clawx as a task engine.

Examples:
- React frontend + Node backend
- internal developer portal
- job runner / automation service
- Electron or desktop wrapper

### 4. Custom compositions

You can combine exported tool factories or Clawx config/model helpers with your own logic.

---

## Existing examples

The repo already includes programmatic examples under `examples/`:
- `examples/run-task.mjs`
- `examples/multi-turn.mjs`
- `examples/custom-config.mjs`
- `examples/ci-codegen.mjs`

Those examples demonstrate library-style usage such as:

```js
import { loadConfig, runAgent, createStreamRenderer } from "@halfagiraf/clawx";
```

So if you remembered that Clawx already had a programmatic story, you were right.

---

## Install

```bash
npm install @halfagiraf/clawx
```

Then either configure Clawx normally with:

```bash
clawx init
```

or pass config directly in code.

---

## Minimal example

```js
import { loadConfig, runAgent, createStreamRenderer } from "@halfagiraf/clawx";

const config = loadConfig();
const renderer = createStreamRenderer();

const result = await runAgent(config, {
  prompt: "List the files in the current directory and summarize this project",
  onEvent: (event) => renderer.onEvent(event),
});

renderer.finish();
console.log(result.aborted ? "aborted" : "done");
```

---

## Multi-turn example

```js
import { loadConfig, runAgent } from "@halfagiraf/clawx";

const config = loadConfig();
let messages = [];

for (const prompt of [
  "Create calc.js with add and subtract",
  "Add multiply and divide",
  "Write tests",
]) {
  const result = await runAgent(config, {
    prompt,
    messages,
  });

  messages = result.messages;
}
```

This is a good fit when your app or script wants incremental agent work with shared context.

---

## Custom config example

```js
import { loadConfig, runAgent } from "@halfagiraf/clawx";

const config = loadConfig({
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  apiKey: process.env.DEEPSEEK_API_KEY,
  workDir: process.cwd(),
});

await runAgent(config, {
  prompt: "Generate a Dockerfile for this app",
});
```

This is useful when your host app wants to control provider/model settings explicitly rather than depending on user config files.

---

## CI / automation example

Clawx can be used in headless build or automation flows.

Typical pattern:
- run agent task
- capture structured events
- decide pass/fail from the result
- return JSON or pipeline-friendly output

This is already demonstrated in `examples/ci-codegen.mjs`.

---

## React or full-stack app usage

Yes, Clawx can be installed as part of a React/full-stack app.

The usual shape is:

### Frontend
- React UI
- task history
- chat UI
- job status
- file/result display

### Backend
- Node server or worker process
- imports `@halfagiraf/clawx`
- runs headless agent tasks
- manages config/session state
- exposes app-specific APIs

This is usually better than trying to run Clawx directly in the browser.

### Recommended current approach
- use Clawx from the backend
- treat it as an agent/task engine
- keep secrets and tool execution on the server side

---

## Big realistic example ideas

These are intentionally broad, but still grounded in what Clawx can honestly support today through headless task execution, multi-turn state, exported helpers, and the current tool-driven model.

### Developer workflow ideas
- build a pull-request patch bot for internal repos
- create a release-prep worker that updates versions, changelogs, and docs
- make a repo triage service that scans a codebase and opens structured work items
- generate boilerplate services, routes, tests, and Dockerfiles for new internal projects
- build a migration assistant for framework upgrades, config changes, and repeated code mods
- run a codebase explainer API that answers questions about a repository using the live workspace
- create a “fix the failing build” automation worker for disposable branches
- create a docs-sync worker that patches README/API docs after code changes

### CI / pipeline ideas
- use Clawx in CI to generate missing stubs/tests/configs before a build step
- create a pipeline stage that summarizes changed files and risk areas after each PR
- run a pre-release sanity pass that checks project structure, scripts, and docs consistency
- generate release notes or upgrade notes from git diff plus workspace inspection
- build a pipeline bot that turns CI logs into actionable plain-English failure summaries

### Backend SaaS / product ideas
- expose Clawx as a backend coding endpoint in a developer portal
- build an internal “AI maintainer” service for small codebases
- add a chat-to-code feature to a product where the backend safely runs Clawx in a sandbox/workspace
- create a support-agent backend that inspects customer-specific config repos and suggests fixes
- build an operations assistant that edits config, scripts, and runbooks in controlled environments

### Team / org workflow ideas
- create a repo onboarding assistant that explains a project and generates first-task suggestions
- build a change-impact explainer for engineers and PMs
- create a team docs gardener that standardizes docs structure across repos
- build a handover assistant that summarizes what changed in a branch and what still needs work
- create a ticket-to-implementation helper that turns structured tickets into first-pass patches

### Persona-driven ideas

Clawx already has persona and memory concepts in the product, and that means you can shape different workers or runs toward different roles and styles.

Grounded examples:
- reviewer persona focused on caution, edge cases, and clarity
- builder persona focused on fast scaffolding and iteration
- docs persona focused on explanation and user-facing clarity
- ops persona focused on config, scripts, and environment hygiene
- research persona focused on comparing options before patching
- QA persona focused on test gaps and breakage risk

Used honestly, personas can make an embedded workflow feel like distinct specialists without claiming magical hidden routing.

### Internal tool ideas
- Slack/Discord-triggered maintenance runner backed by Clawx on the server
- a web dashboard that lets trusted users launch codegen or repo-inspection tasks
- a local desktop app for managing personal scripts, notes, and code repos with Clawx behind it
- a home-lab control panel that uses Clawx for scripts, config patches, and environment summaries
- a documentation copilot for internal markdown/runbook repos

### Multi-step orchestration ideas
- inspect repo → propose plan → patch code → write tests → summarize result
- read logs → identify likely fix area → patch config/code → rerun command → summarize outcome
- generate feature scaffold → add docs → add tests → produce rollout notes
- scan a monorepo package → detect outdated patterns → patch one package at a time across turns

### Niche domain helper ideas
- CMS/plugin upgrade helper for a known internal stack
- static-site maintenance helper for content repos
- infra-script assistant for shell/python utility repos
- config transformer for a repeated internal format
- markdown/report generator for engineering ops summaries
- legacy repo explainer for old codebases with weak docs

---

## Go wild: more programmatic ideas worth trying

These are more expansive. They are plausible, but should be treated as product/application ideas rather than claims that Clawx already ships them turnkey.

### App patterns
- “chat with your codebase” backend for internal engineering portals
- branch-scoped temporary coding agents spun up per task/job
- a background maintenance daemon that audits and tidies selected repos on schedule
- a web IDE assistant backed by Clawx tasks on the server
- a self-hosted coding concierge for a small engineering org

### Persona-rich patterns
- code reviewer mode
- architect mode
- migration planner mode
- incident summarizer mode
- documentation editor mode
- junior-helper mode for onboarding and explanation
- strict-linter personality for cleanup passes
- release manager personality for packaging/checklist work

### Home-lab / ops patterns
- Raspberry Pi-side environment inspector
- script patcher for small devices or utility boxes
- service-config maintainer in controlled folders
- runbook improver for operational documentation
- deployment prep assistant that updates scripts/docs/config examples

### Knowledge and content patterns
- changelog drafter
- README normalizer
- internal tutorial generator from live project structure
- project status summarizer from repo state and recent changes
- code-to-doc transformation helper for small services/libraries

### Product workflow patterns
- support escalation helper that inspects a workspace snapshot and drafts a technical response
- implementation-draft helper for product specs and tickets
- feature spike generator for throwaway prototype repos
- migration rehearsal bot in disposable branches

### Guarded-use patterns
Because Clawx is permissive by default, app builders may want to place it behind:
- sandboxed workspaces
- disposable clones
- branch-only workflows
- environment-level restrictions
- human review before merge/deploy

That does not reduce what Clawx can do programmatically. It just makes the host application safer and more intentional.

---

## Could it do almost anything?

Within reason, it can do a very wide range of software and automation tasks because it can:
- read and write files
- inspect repos
- run shell commands
- carry context across turns
- be embedded in backend flows
- be shaped with persona/system prompting
- be combined with custom tools and extension ideas

But it is important not to overclaim.

Honest boundaries:
- Clawx does not magically guarantee correctness
- Clawx does not replace normal engineering validation
- browser-only embedding is not the intended shape
- full agent-network embedding is not yet a polished public SDK
- personas shape behavior, but they are not magic specialists with guaranteed competence

So the truthful way to say it is:

> Clawx can be used programmatically for a very wide range of coding, automation, analysis, and workflow tasks, especially on the backend or in trusted environments, but it still needs deliberate product design, safe execution boundaries, and real verification like any other powerful agent runtime.

---

## What is stable today vs what is not yet a polished SDK

### Strongest current programmatic surface
- `runAgent`
- config loading
- session helpers
- streaming event handling
- tool factory reuse
- headless automation patterns

### Real but not yet polished as a public SDK surface
- full master/worker lifecycle embedding
- peer-master federation embedding
- programmatic worker orchestration via a documented public library API
- event subscriptions for all agent-network operations as a stable app API

Those runtime capabilities are real in the product, but the best-supported interface for many of them is still the product/runtime flow rather than a dedicated SDK package.

---

## When to use library mode vs CLI mode

### Use library/programmatic mode when
- you are embedding Clawx in your own Node app
- you want headless automation
- you want scripted multi-turn execution
- you want CI/codegen behavior
- you want to manage output/events yourself

### Use CLI mode when
- you want the normal terminal UX
- you want interactive coding sessions
- you want the built-in TUI
- you want to operate directly as a user rather than through your own app

### Use master/worker/peer runtime when
- you want distributed worker orchestration
- you want peer-master federation across machines
- you want explicit worker lifecycle/persona/memory flows
- you want Clawx acting as a real orchestration runtime rather than just a single headless task runner

---

## Recommended architecture if embedding Clawx in an app

For most apps today, the best pattern is:

1. frontend or caller sends a task request
2. backend loads config or injects config
3. backend calls `runAgent(...)`
4. backend streams or stores events/results
5. backend returns status/result to the app

That is the simplest honest integration path.

If you later need the distributed runtime side, you can layer master/worker/peer operations on top of that rather than forcing everything through one giant abstraction up front.

---

## Important caveats

- Clawx is permissive by design and can execute real file/shell actions.
- It is best embedded in environments you trust.
- Browser-only embedding is not the intended shape.
- The full runtime is richer than the current documented SDK surface.
- If you want a fully stable long-term embedding API for all agent-network features, that would likely be a future explicit SDK/productization step.

---

## Summary

Clawx can already be used as:
- a CLI
- a headless coding agent library
- a CI/codegen helper
- a backend task engine inside a larger app

And the repo already contains examples proving that path.

The main thing still missing is not possibility, but cleaner documentation and a more formal public SDK story for the newer orchestration/runtime features.
