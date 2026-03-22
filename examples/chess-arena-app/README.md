# Chess Arena App

A React + Express example app showing Clawx used programmatically to power and package a more structured interactive application example.

## What it is

This example is a browser chess arena where White and Black autoplay against each other.

It is designed to show that Clawx examples do not need to stop at repo summaries or text analysis. Clawx can also sit behind richer application workflows and help produce real interactive browser apps.

## What it includes

- React frontend
- lightweight Express backend
- chess board UI
- autoplay between White and Black
- move history
- reset, pause, and speed controls
- simple status messaging

## Setup

```bash
cd examples/chess-arena-app
npm install
cp .env.example .env
```

Then add your own provider/model/API key values to `.env`.

## Run

```bash
npm run dev
```

Frontend:
- http://localhost:5178

Backend:
- http://localhost:43008/health
