export function buildSingleTurnPrompt(article, previousTurns, speaker, turnNumber) {
  const history = previousTurns.length
    ? previousTurns.map((turn) => `${turn.speaker} (Turn ${turn.turn}): ${turn.text}`).join("\n")
    : "None yet.";

  return `You are roleplaying one side of a two-persona debate about a news article.

ARTICLE
Title: ${article.title}
Source: ${article.source}
Category: ${article.category}
Published: ${article.publishedAt || "unknown"}
Summary: ${article.summary}
Context: ${article.content}

DEBATE HISTORY
${history}

YOUR SPEAKER
${speaker}

SPEAKER STYLE
${speaker === "Pragmatist"
  ? "Skeptical of hype, focused on tradeoffs, incentives, realism, and likely outcomes."
  : "Focused on values, human impact, long-term meaning, and ethical direction."}

TASK
Write only Turn ${turnNumber} for ${speaker}.
Respond with exactly one paragraph, plain text only.
Do not add labels, numbering, markdown, or quotes.
Do not mention being an AI.
Base it only on the article context provided.`;
}

export function buildConclusionPrompt(article, turns) {
  const turnsText = turns.map((turn) => `${turn.speaker} (Turn ${turn.turn}): ${turn.text}`).join("\n");

  return `You are summarizing a completed two-persona debate about a news article.

ARTICLE
Title: ${article.title}
Source: ${article.source}
Summary: ${article.summary}
Context: ${article.content}

DEBATE TURNS
${turnsText}

Write exactly three short sections in plain text, no markdown fences:
PRAGMATIST: <one concise conclusion>
IDEALIST: <one concise conclusion>
SYNTHESIS: <one concise neutral synthesis>`;
}

export function parseConclusions(raw) {
  const text = (raw || "").replace(/\r/g, "").trim();
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);

  return {
    Pragmatist: lines.find((line) => line.startsWith("PRAGMATIST:"))?.replace(/^PRAGMATIST:\s*/, "") || "The pragmatic case emphasizes tradeoffs, incentives, and likely outcomes.",
    Idealist: lines.find((line) => line.startsWith("IDEALIST:"))?.replace(/^IDEALIST:\s*/, "") || "The idealist case emphasizes values, human impact, and moral direction.",
    Synthesis: lines.find((line) => line.startsWith("SYNTHESIS:"))?.replace(/^SYNTHESIS:\s*/, "") || "The reader should weigh both practical realities and ethical priorities.",
  };
}
