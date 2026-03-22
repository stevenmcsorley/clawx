# Repo Maintainer App

A fuller example app that uses Clawx programmatically from an Express backend with a React frontend.

## What it is

This example is designed to show Clawx as a backend engine for repository maintenance workflows rather than as a simple one-shot script.

It provides a small UI for:
- entering a repo path
- asking for a repository summary
- asking for a maintenance plan
- asking for likely risk areas
- viewing backend responses in a cleaner app-style workflow

## Why this exists

This example helps show that Clawx can power a real application workflow:
- React frontend
- Express backend
- `@halfagiraf/clawx` used programmatically in backend routes
- multi-step repo-oriented analysis use cases

## Important note

This example intentionally avoids including any real secrets.
Use your own `.env` file based on `.env.example`.

## Setup

```bash
cd examples/repo-maintainer-app
npm install
cp .env.example .env
```

Set your provider/model/API key values in `.env`.

## Run

```bash
npm run dev
```

Frontend:
- http://localhost:5174

Backend:
- http://localhost:43002/health

## Example flows

- summarize a repo
- generate a maintenance plan
- identify likely risk areas
- inspect a repo before patching or cleanup work
