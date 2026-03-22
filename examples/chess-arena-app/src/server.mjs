import 'dotenv/config';
import express from 'express';
import { Chess } from 'chess.js';
import { runClawxTask } from './clawx.js';

const app = express();
const port = process.env.PORT || 43008;

app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'chess-arena-app' });
});

function buildChessPrompt(fen, color, legalMoves, moveHistory) {
  const side = color === 'w' ? 'White' : 'Black';
  const historyStr = moveHistory.length > 0
    ? moveHistory.map((m, i) => `${i + 1}. ${m}`).join(' ')
    : 'Game just started.';

  return `You are a chess engine playing as ${side}.

Current position (FEN): ${fen}
Move history: ${historyStr}
Legal moves available: ${legalMoves.join(', ')}

Analyze the position briefly (2-4 sentences about what you see — material, threats, key squares) then choose the best move.

IMPORTANT: You MUST end your response with exactly this format on its own line:
MOVE: <your chosen move in SAN notation>

For example: MOVE: e4
Or: MOVE: Nf3
Or: MOVE: O-O

Pick from the legal moves listed above. Think strategically.`;
}

function extractMove(text, legalMoves) {
  // Look for MOVE: pattern
  const moveMatch = text.match(/MOVE:\s*([A-Za-z0-9+#=\-]+)/);
  if (moveMatch) {
    const candidate = moveMatch[1].trim();
    if (legalMoves.includes(candidate)) return candidate;
    // Try case-insensitive match
    const found = legalMoves.find((m) => m.toLowerCase() === candidate.toLowerCase());
    if (found) return found;
  }

  // Fallback: scan for any legal move mentioned in the text (prefer longer matches first)
  const sorted = [...legalMoves].sort((a, b) => b.length - a.length);
  for (const move of sorted) {
    if (text.includes(move)) return move;
  }

  // Last resort: random legal move
  return legalMoves[Math.floor(Math.random() * legalMoves.length)];
}

function extractBestText(messages = []) {
  const assistantMessages = messages.filter((m) => m?.role === 'assistant');
  for (let i = assistantMessages.length - 1; i >= 0; i -= 1) {
    const content = assistantMessages[i]?.content;
    if (typeof content === 'string' && content.trim()) return content.trim();
    if (Array.isArray(content)) {
      const text = content
        .filter((item) => item?.type === 'text')
        .map((item) => item.text || '')
        .join('\n\n')
        .trim();
      if (text) return text;
    }
  }
  return '';
}

// SSE streaming endpoint for AI moves
app.get('/api/move/stream', async (req, res) => {
  const { fen, moveHistory } = req.query;

  if (!fen) {
    res.status(400).json({ error: 'fen is required' });
    return;
  }

  let game;
  try {
    game = new Chess(fen);
  } catch {
    res.status(400).json({ error: 'Invalid FEN' });
    return;
  }

  const legalMoves = game.moves();
  if (legalMoves.length === 0) {
    res.status(400).json({ error: 'No legal moves available' });
    return;
  }

  const color = game.turn();
  const history = moveHistory ? moveHistory.split(',').filter(Boolean) : [];

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  function sendSSE(eventType, data) {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  sendSSE('status', { phase: 'thinking', color: color === 'w' ? 'White' : 'Black' });

  const prompt = buildChessPrompt(fen, color, legalMoves, history);

  try {
    const result = await runClawxTask({
      prompt,
      signal: controller.signal,
      onEvent: (event) => {
        try {
          if (event.type === 'message_update') {
            const sub = event.assistantMessageEvent;
            if (sub && sub.type === 'text_delta' && sub.delta) {
              sendSSE('text_delta', { delta: sub.delta });
            }
          }
        } catch {
          // ignore
        }
      },
    });

    const fullText = extractBestText(result.messages || []);
    const chosenMove = extractMove(fullText, legalMoves);

    sendSSE('move', {
      move: chosenMove,
      reasoning: fullText,
      color: color === 'w' ? 'White' : 'Black',
    });
  } catch (error) {
    // On error, fall back to a random move so the game continues
    const fallback = legalMoves[Math.floor(Math.random() * legalMoves.length)];
    sendSSE('move', {
      move: fallback,
      reasoning: `(Clawx unavailable — random fallback: ${fallback})`,
      color: color === 'w' ? 'White' : 'Black',
      fallback: true,
    });
    sendSSE('error', { message: error instanceof Error ? error.message : String(error) });
  } finally {
    res.end();
  }
});

app.listen(port, () => {
  console.log(`Chess Arena server listening on http://localhost:${port}`);
});
