import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowIcon, DebateIcon, GlobeIcon, SparkIcon } from "./icons.jsx";

function formatDate(value) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

function SpeakerAvatar({ speaker }) {
  const letter = speaker === "Pragmatist" ? "P" : "I";
  return <div className={`avatar avatar-${speaker.toLowerCase()}`}>{letter}</div>;
}

function statusLabel(phase) {
  if (!phase || phase === "idle") return "Waiting...";
  if (phase === "connecting") return "Connecting...";
  if (phase === "complete") return "Complete";
  if (phase === "generating-conclusions") return "Synthesizing conclusions...";
  const m = phase.match(/generating-turn-(\d+)/);
  if (m) return `Generating turn ${m[1]}...`;
  return "Thinking...";
}

export default function App() {
  const [articles, setArticles] = useState([]);
  const [feeds, setFeeds] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loadingNews, setLoadingNews] = useState(true);
  const [debating, setDebating] = useState(false);
  const [error, setError] = useState("");
  const [debate, setDebate] = useState(null);
  const [streamStatus, setStreamStatus] = useState("idle");
  const [liveTurns, setLiveTurns] = useState([]);

  const debateFeedRef = useRef(null);

  useEffect(() => { loadNews(); }, []);

  useEffect(() => {
    const el = debateFeedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [liveTurns, debate]);

  async function loadNews() {
    setLoadingNews(true);
    setError("");
    try {
      const response = await fetch("/api/news");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load news");
      setArticles(data.articles || []);
      setFeeds(data.feeds || []);
      if (!selectedId && data.articles?.length) setSelectedId(data.articles[0].id);
    } catch (err) {
      setError(err.message || "Failed to load news");
    } finally {
      setLoadingNews(false);
    }
  }

  const selectedArticle = useMemo(
    () => articles.find((a) => a.id === selectedId) || articles[0] || null,
    [articles, selectedId]
  );

  async function startDebate() {
    if (!selectedArticle) return;
    setDebating(true);
    setError("");
    setDebate(null);
    setLiveTurns([]);
    setStreamStatus("connecting");

    try {
      const response = await fetch("/api/debate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ article: selectedArticle }),
      });

      if (!response.ok || !response.body) {
        const fallback = await response.text();
        throw new Error(fallback || "Failed to start streaming debate");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const lines = block.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event:"));
          const dataLine = lines.find((l) => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;

          const eventName = eventLine.replace("event:", "").trim();
          const payload = JSON.parse(dataLine.replace("data:", "").trim());

          if (eventName === "status") setStreamStatus(payload.phase || "streaming");
          if (eventName === "turn") setLiveTurns((cur) => [...cur, payload.turn]);
          if (eventName === "complete") {
            setStreamStatus("complete");
            setDebate(payload.debate || null);
          }
          if (eventName === "error") throw new Error(payload.error || "Streaming failed");
        }
      }
    } catch (err) {
      setError(err.message || "Failed to generate debate");
    } finally {
      setDebating(false);
    }
  }

  const totalTurns = 8;
  const currentTurn = liveTurns.length;
  const progress = debate ? 1 : currentTurn / totalTurns;
  const showDebate = debating || debate;
  const displayTurns = debate ? debate.turns : liveTurns;

  return (
    <div className="app-shell">
      <div className="hero-orb hero-orb-a" />
      <div className="hero-orb hero-orb-b" />

      <header className="app-header">
        <div className="header-left">
          <div className="hero-badge"><SparkIcon /> Clawx Programmatic</div>
          <h1>AI Debate</h1>
        </div>
        <div className="header-actions">
          <button className="secondary-btn" onClick={loadNews} disabled={loadingNews}>
            <GlobeIcon /> {loadingNews ? "Refreshing..." : "Refresh feeds"}
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="app-body">
        {/* Stories sidebar */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="eyebrow">Live feeds</div>
            <span className="feed-count">{feeds.length} sources</span>
          </div>
          <div className="article-list">
            {loadingNews
              ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="article-skeleton" />)
              : articles.map((article) => (
                  <button
                    key={article.id}
                    className={`article-card${selectedArticle?.id === article.id ? " active" : ""}`}
                    onClick={() => setSelectedId(article.id)}
                  >
                    <div className="article-meta">
                      <span className={`accent-dot accent-${article.accent}`} />
                      <span>{article.source}</span>
                      <span className="meta-sep">&middot;</span>
                      <span>{article.category}</span>
                    </div>
                    <h3>{article.title}</h3>
                  </button>
                ))}
          </div>
        </aside>

        {/* Main split: article + debate */}
        <div className="main-split">
          {/* Article context pane */}
          <section className="pane article-pane">
            <div className="pane-header">
              <div className="eyebrow">Article context</div>
              {selectedArticle && (
                <a href={selectedArticle.link} target="_blank" rel="noreferrer" className="link-btn small">
                  Open <ArrowIcon />
                </a>
              )}
            </div>

            {selectedArticle ? (
              <div className="article-body">
                <h2 className="article-title">{selectedArticle.title}</h2>
                <div className="context-meta">
                  <span className={`accent-dot accent-${selectedArticle.accent}`} />
                  <span>{selectedArticle.source}</span>
                  <span className="meta-sep">&middot;</span>
                  <span>{formatDate(selectedArticle.publishedAt)}</span>
                </div>

                <div className="article-section">
                  <h3>Summary</h3>
                  <p>{selectedArticle.summary}</p>
                </div>

                <div className="article-section">
                  <h3>Full context</h3>
                  <p>{selectedArticle.content}</p>
                </div>
              </div>
            ) : (
              <div className="empty-state centered">Select a story from the sidebar</div>
            )}
          </section>

          {/* Live debate pane */}
          <section className="pane debate-pane">
            <div className="pane-header">
              <div>
                <div className="eyebrow">Live debate</div>
                <div className="debate-subtitle">Pragmatist vs Idealist</div>
              </div>
              <button className="primary-btn" onClick={startDebate} disabled={!selectedArticle || debating}>
                <DebateIcon /> {debating ? "Streaming..." : "Generate"}
              </button>
            </div>

            {showDebate && (
              <div className="debate-progress">
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
                </div>
                <div className="progress-label">
                  {debating && <span className="live-dot" />}
                  <span>{debate ? "Complete" : `Turn ${currentTurn} / ${totalTurns}`}</span>
                </div>
              </div>
            )}

            <div className="debate-feed" ref={debateFeedRef}>
              {!showDebate && (
                <div className="empty-state centered">
                  Select an article and click Generate to start a debate.
                </div>
              )}

              {displayTurns?.map((turn) => (
                <div key={`${turn.speaker}-${turn.turn}`} className={`chat-msg ${turn.speaker.toLowerCase()}`}>
                  <SpeakerAvatar speaker={turn.speaker} />
                  <div className="msg-body">
                    <div className="msg-header">
                      <span className="speaker-name">{turn.speaker}</span>
                      <span className="turn-label">Turn {turn.turn}</span>
                    </div>
                    <p className="msg-text">{turn.text}</p>
                  </div>
                </div>
              ))}

              {debating && streamStatus !== "complete" && (
                <div className="typing-indicator">
                  <div className="typing-dots"><span /><span /><span /></div>
                  <span className="typing-status">{statusLabel(streamStatus)}</span>
                </div>
              )}

              {debate?.conclusions && (
                <div className="conclusions">
                  <div className="conclusions-divider"><span>Conclusions</span></div>

                  <div className="chat-msg pragmatist conclusion">
                    <SpeakerAvatar speaker="Pragmatist" />
                    <div className="msg-body">
                      <div className="msg-header">
                        <span className="speaker-name">Pragmatist</span>
                        <span className="turn-label">Final position</span>
                      </div>
                      <p className="msg-text">{debate.conclusions.Pragmatist}</p>
                    </div>
                  </div>

                  <div className="chat-msg idealist conclusion">
                    <SpeakerAvatar speaker="Idealist" />
                    <div className="msg-body">
                      <div className="msg-header">
                        <span className="speaker-name">Idealist</span>
                        <span className="turn-label">Final position</span>
                      </div>
                      <p className="msg-text">{debate.conclusions.Idealist}</p>
                    </div>
                  </div>

                  <div className="synthesis-card">
                    <div className="synthesis-header"><SparkIcon /> Synthesis</div>
                    <p>{debate.conclusions.Synthesis}</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
