import "dotenv/config";
import express from "express";
import { runClawxTask } from "./clawx.js";
import { buildConclusionPrompt, buildSingleTurnPrompt, parseConclusions } from "./debate.js";
import { fetchNewsArticles } from "./news.js";

function flattenContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((item) => {
      if (!item) return "";
      if (typeof item === "string") return item;
      if (item.type === "text") return item.text || "";
      return "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function findBestAssistantText(messages = []) {
  const assistantMessages = messages.filter((message) => message?.role === "assistant");

  for (let index = assistantMessages.length - 1; index >= 0; index -= 1) {
    const text = flattenContent(assistantMessages[index]?.content);
    if (text) return text;
  }

  return "";
}

function sseSend(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function generateTurn(article, turns, speaker, turnNumber) {
  const prompt = buildSingleTurnPrompt(article, turns, speaker, turnNumber);
  const result = await runClawxTask({
    prompt,
    messages: [],
    parseTextToolCalls: false,
    noTools: true,
  });

  const text = Array.isArray(result.messages) ? findBestAssistantText(result.messages) : "";
  return (text || "").trim();
}

async function generateConclusions(article, turns) {
  const prompt = buildConclusionPrompt(article, turns);
  const result = await runClawxTask({
    prompt,
    messages: [],
    parseTextToolCalls: false,
    noTools: true,
  });

  const text = Array.isArray(result.messages) ? findBestAssistantText(result.messages) : "";
  return parseConclusions(text || "");
}

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "clawx-news-debate-app" });
});

app.get("/api/news", async (_req, res) => {
  try {
    const data = await fetchNewsArticles();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/debate", async (req, res) => {
  try {
    const { article } = req.body ?? {};

    if (!article || typeof article !== "object") {
      return res.status(400).json({ error: "article is required" });
    }

    const turns = [];
    for (let index = 0; index < 8; index += 1) {
      const speaker = index % 2 === 0 ? "Pragmatist" : "Idealist";
      const text = await generateTurn(article, turns, speaker, index + 1);
      turns.push({ speaker, turn: index + 1, text: text || `No response for turn ${index + 1}.` });
    }

    const conclusions = await generateConclusions(article, turns);

    res.json({
      aborted: false,
      debate: {
        article: {
          title: article.title || "",
          source: article.source || "",
          summary: article.summary || "",
        },
        turns,
        conclusions,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/debate/stream", async (req, res) => {
  const { article } = req.body ?? {};

  if (!article || typeof article !== "object") {
    return res.status(400).json({ error: "article is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // Keep streaming request alive until we finish generating.

  try {
    const turns = [];
    sseSend(res, "status", { phase: "starting" });

    for (let index = 0; index < 8; index += 1) {
      const speaker = index % 2 === 0 ? "Pragmatist" : "Idealist";
      sseSend(res, "status", { phase: `generating-turn-${index + 1}`, turn: index + 1, speaker });
      const text = await generateTurn(article, turns, speaker, index + 1);
      const turn = { speaker, turn: index + 1, text: text || `No response for turn ${index + 1}.` };
      turns.push(turn);
      sseSend(res, "turn", { turn });
    }

    sseSend(res, "status", { phase: "generating-conclusions" });
    const conclusions = await generateConclusions(article, turns);

    sseSend(res, "complete", {
      aborted: false,
      debate: {
        article: {
          title: article.title || "",
          source: article.source || "",
          summary: article.summary || "",
        },
        turns,
        conclusions,
      },
    });
  } catch (error) {
    sseSend(res, "error", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    res.end();
  }
});

app.post("/api/run", async (req, res) => {
  try {
    const { prompt, messages = [] } = req.body ?? {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt is required" });
    }

    const result = await runClawxTask({ prompt, messages });
    const bestText = Array.isArray(result.messages) ? findBestAssistantText(result.messages) : "";

    res.json({
      aborted: result.aborted ?? false,
      text: bestText || "",
      messages: result.messages ?? [],
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.listen(port, () => {
  console.log(`Clawx news debate server listening on http://localhost:${port}`);
});
