# Ops Copilot App

A React + Express example app showing Clawx used programmatically as an operations and environment inspection backend.

## What it is

This example demonstrates Clawx as more than a coding assistant.
It provides a small UI for running safe environment/ops checks against a selected workspace or machine-oriented context.

## What it shows

- React frontend
- Express backend
- `@halfagiraf/clawx` used programmatically in backend routes
- Clawx as an ops-style inspection engine rather than only a coding engine

## MVP checks included

- system summary
- disk / memory view
- runtime version view
- apps / directory inventory

## Setup

```bash
cd examples/ops-copilot-app
npm install
cp .env.example .env
```

Then add your own provider/model/API key values to `.env`.

## Run

```bash
npm run dev
```

Frontend:
- http://localhost:5176

Backend:
- http://localhost:43006/health
