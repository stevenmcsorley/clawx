import 'dotenv/config';
import express from 'express';
import { runClawxTask } from './clawx.js';

const app = express();
const port = process.env.PORT || 43006;

app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ops-copilot-app' });
});

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

function buildPrompt(mode, targetPath) {
  if (mode === 'summary') {
    return `You are acting as an operations copilot for the workspace/path: ${targetPath}\n\nProvide a concise system/workspace summary. Explain what this environment appears to contain, what kind of machine/work area it looks like, and the most important things an operator should notice first. Use tools if needed.`;
  }
  if (mode === 'resources') {
    return `You are acting as an operations copilot for the workspace/path: ${targetPath}\n\nInspect this environment and report resource-oriented information such as disk, visible directories, and anything clearly relevant to operational health. Use tools if needed.`;
  }
  if (mode === 'runtime') {
    return `You are acting as an operations copilot for the workspace/path: ${targetPath}\n\nInspect the environment and summarize runtime/tooling state such as Node, npm, Python, git, and anything obviously relevant to developer or ops workflows. Use tools if needed.`;
  }
  return `You are acting as an operations copilot for the workspace/path: ${targetPath}\n\nInspect this environment and summarize notable app folders, services, projects, or operationally interesting directories. Use tools if needed.`;
}

// SSE streaming endpoint
app.get('/api/inspect/stream', async (req, res) => {
  const { targetPath, mode = 'summary' } = req.query;

  if (!targetPath || typeof targetPath !== 'string') {
    res.status(400).json({ error: 'targetPath is required' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const prompt = buildPrompt(mode, targetPath);
  const controller = new AbortController();

  req.on('close', () => controller.abort());

  function sendSSE(eventType, data) {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  sendSSE('status', { phase: 'started', mode, targetPath });

  let currentToolName = null;

  try {
    const result = await runClawxTask({
      prompt,
      workDir: targetPath,
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

// Keep original POST endpoint as fallback
app.post('/api/inspect', async (req, res) => {
  try {
    const { targetPath, mode = 'summary' } = req.body ?? {};
    if (!targetPath || typeof targetPath !== 'string') {
      return res.status(400).json({ error: 'targetPath is required' });
    }

    const prompt = buildPrompt(mode, targetPath);
    const result = await runClawxTask({ prompt, workDir: targetPath });
    const text = extractBestText(result.messages || []);

    res.json({
      ok: true,
      mode,
      targetPath,
      aborted: result.aborted ?? false,
      text,
      messages: result.messages ?? [],
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.listen(port, () => {
  console.log(`Ops Copilot server listening on http://localhost:${port}`);
});
