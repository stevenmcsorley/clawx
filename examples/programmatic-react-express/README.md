# Clawx Programmatic App

Simple React + Express app using Clawx programmatically.

## Install

```bash
npm install
```

## Configure DeepSeek

Set environment variables before running:

### Windows PowerShell

```powershell
$env:DEEPSEEK_API_KEY="your-key"
$env:CLAWDEX_PROVIDER="deepseek"
$env:CLAWDEX_BASE_URL="https://api.deepseek.com/v1"
$env:CLAWDEX_MODEL="deepseek-chat"
```

### cmd.exe

```cmd
set DEEPSEEK_API_KEY=your-key
set CLAWDEX_PROVIDER=deepseek
set CLAWDEX_BASE_URL=https://api.deepseek.com/v1
set CLAWDEX_MODEL=deepseek-chat
```

## Run

```bash
npm run dev
```

Frontend:
- http://localhost:5173

Backend:
- http://localhost:3000/health

## API

```bash
curl -X POST http://localhost:3000/api/run \
  -H "Content-Type: application/json" \
  -d '{"prompt":"List files and summarize this project"}'
```

## Notes

This project uses:
- `loadConfig`
- `runAgent`
- `createStreamRenderer`

The app reads `DEEPSEEK_API_KEY` or `CLAWDEX_API_KEY` from the environment and does not require interactive CLI setup if those are provided.
