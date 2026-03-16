#!/bin/bash
# Side-by-side comparison: local model vs DeepSeek API
# Run this from the directory where you want the code generated.
#
# Usage:
#   bash examples/side-by-side.sh "Create a Python CLI calculator"
#
# Prerequisites:
#   - Ollama running with a model pulled (e.g. ollama pull qwen2.5-coder:14b)
#   - DeepSeek API key set in DEEPSEEK_KEY env var
#
# Tip: Record with asciinema for shareable terminal recordings:
#   asciinema rec demo.cast -c "bash examples/side-by-side.sh 'your prompt'"

PROMPT="${1:-Create a Python CLI calculator with add, subtract, multiply, divide}"
DEEPSEEK_KEY="${DEEPSEEK_KEY:-$CLAWDEX_API_KEY}"

echo "═══════════════════════════════════════════"
echo "  PROMPT: $PROMPT"
echo "═══════════════════════════════════════════"
echo ""

# --- Local model ---
echo "┌─────────────────────────────────────────┐"
echo "│  LOCAL: qwen2.5-coder:14b via Ollama    │"
echo "└─────────────────────────────────────────┘"
mkdir -p /tmp/clawx-local && cd /tmp/clawx-local && rm -rf *

LOCAL_START=$(date +%s)
CLAWDEX_PROVIDER=ollama \
CLAWDEX_BASE_URL=http://localhost:11434/v1 \
CLAWDEX_MODEL=qwen2.5-coder:14b \
CLAWDEX_API_KEY=not-needed \
clawx run "$PROMPT"
LOCAL_END=$(date +%s)
LOCAL_TIME=$((LOCAL_END - LOCAL_START))

echo ""
echo "  Local time: ${LOCAL_TIME}s"
echo "  Files created:"
ls -la /tmp/clawx-local/
echo ""

# --- DeepSeek API ---
echo "┌─────────────────────────────────────────┐"
echo "│  API: deepseek-chat via DeepSeek        │"
echo "└─────────────────────────────────────────┘"
mkdir -p /tmp/clawx-deepseek && cd /tmp/clawx-deepseek && rm -rf *

API_START=$(date +%s)
CLAWDEX_PROVIDER=deepseek \
CLAWDEX_BASE_URL=https://api.deepseek.com/v1 \
CLAWDEX_MODEL=deepseek-chat \
CLAWDEX_API_KEY="$DEEPSEEK_KEY" \
clawx run "$PROMPT"
API_END=$(date +%s)
API_TIME=$((API_END - API_START))

echo ""
echo "  API time: ${API_TIME}s"
echo "  Files created:"
ls -la /tmp/clawx-deepseek/
echo ""

# --- Summary ---
echo "═══════════════════════════════════════════"
echo "  RESULTS"
echo "═══════════════════════════════════════════"
echo "  Local (qwen2.5-coder:14b): ${LOCAL_TIME}s"
echo "  API   (deepseek-chat):     ${API_TIME}s"
echo "═══════════════════════════════════════════"
