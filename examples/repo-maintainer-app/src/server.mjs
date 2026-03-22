import 'dotenv/config';
import express from 'express';
import { runClawxTask } from './clawx.js';

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'repo-maintainer-app' });
});

function buildPrompt(mode, repoPath) {
  if (mode === 'summary') {
    return `You are inspecting a repository at: ${repoPath}\n\nSummarize what this repository appears to be, its likely purpose, important folders/files, and what a maintainer should understand first. Use tools if needed.`;
  }
  if (mode === 'plan') {
    return `You are inspecting a repository at: ${repoPath}\n\nProduce a practical maintenance plan for this repository. Include likely cleanup work, risk areas, dependency/config review points, documentation gaps, and safe next steps. Use tools if needed.`;
  }
  return `You are inspecting a repository at: ${repoPath}\n\nIdentify likely maintenance risk areas in this repository. Focus on fragile areas, unclear structure, config/dependency risks, missing tests/docs, and anything a maintainer should be cautious about. Use tools if needed.`;
}

function extractBestText(messages = []) {
  const assistantMessages = messages.filter((message) => message?.role === 'assistant');
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

// SSE streaming endpoint
app.get('/api/repo-inspect/stream', async (req, res) => {
  const { repoPath, mode = 'summary' } = req.query;

  if (!repoPath || typeof repoPath !== 'string') {
    res.status(400).json({ error: 'repoPath is required' });
    return;
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const prompt = buildPrompt(mode, repoPath);
  const controller = new AbortController();

  req.on('close', () => controller.abort());

  function sendSSE(eventType, data) {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  sendSSE('status', { phase: 'started', mode, repoPath });

  let currentToolName = null;

  try {
    const result = await runClawxTask({
      prompt,
      workDir: repoPath,
      signal: controller.signal,
      onEvent: (event) => {
        try {
          switch (event.type) {
            case 'message_update': {
              const sub = event.assistantMessageEvent;
              if (sub && sub.type === 'text_delta' && sub.delta) {
                sendSSE('text_delta', { delta: sub.delta });
              }
              break;
            }
            case 'tool_execution_start': {
              currentToolName = event.toolName || event.name || 'tool';
              sendSSE('tool_start', { tool: currentToolName });
              break;
            }
            case 'tool_execution_end': {
              sendSSE('tool_end', { tool: currentToolName || 'tool' });
              currentToolName = null;
              break;
            }
            case 'turn_start': {
              sendSSE('status', { phase: 'thinking' });
              break;
            }
            case 'turn_end': {
              sendSSE('status', { phase: 'turn_complete' });
              break;
            }
          }
        } catch {
          // Ignore write errors if client disconnected
        }
      },
    });

    // Send the final assembled text as well, in case streaming missed anything
    const finalText = extractBestText(result.messages || []);
    sendSSE('complete', {
      text: finalText,
      aborted: result.aborted ?? false,
    });
  } catch (error) {
    sendSSE('error', { message: error instanceof Error ? error.message : String(error) });
  } finally {
    res.end();
  }
});

// Keep the original POST endpoint as fallback
app.post('/api/repo-inspect', async (req, res) => {
  try {
    const { repoPath, mode = 'summary' } = req.body ?? {};
    if (!repoPath || typeof repoPath !== 'string') {
      return res.status(400).json({ error: 'repoPath is required' });
    }

    const prompt = buildPrompt(mode, repoPath);
    const result = await runClawxTask({ prompt, workDir: repoPath });
    const text = extractBestText(result.messages || []);

    res.json({
      ok: true,
      mode,
      repoPath,
      aborted: result.aborted ?? false,
      text,
      messages: result.messages ?? [],
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.listen(port, () => {
  console.log(`Repo Maintainer server listening on http://localhost:${port}`);
});
