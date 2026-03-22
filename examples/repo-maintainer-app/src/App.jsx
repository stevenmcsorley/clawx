import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  GitBranch,
  FolderSearch,
  ClipboardList,
  AlertTriangle,
  Play,
  Loader2,
  Wrench,
  CheckCircle2,
  XCircle,
  Sparkles,
  ChevronRight,
  Terminal,
} from 'lucide-react';

const MODES = [
  {
    id: 'summary',
    label: 'Repository Summary',
    description: 'Explain the repo structure and purpose',
    icon: FolderSearch,
  },
  {
    id: 'plan',
    label: 'Maintenance Plan',
    description: 'Propose practical upkeep and cleanup',
    icon: ClipboardList,
  },
  {
    id: 'risk',
    label: 'Risk Areas',
    description: 'Identify fragile or unclear areas',
    icon: AlertTriangle,
  },
];

function ToolActivity({ tools }) {
  if (tools.length === 0) return null;
  return (
    <div className="tool-activity">
      {tools.map((t, i) => (
        <div key={i} className={`tool-pill ${t.done ? 'done' : 'active'}`}>
          {t.done ? <CheckCircle2 size={12} /> : <Loader2 size={12} className="spin" />}
          <span>{t.name}</span>
        </div>
      ))}
    </div>
  );
}

function StreamingOutput({ text, isStreaming }) {
  const endRef = useRef(null);

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [text]);

  return (
    <div className={`markdown-body ${isStreaming ? 'streaming' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            if (!inline && match) {
              return (
                <div className="code-block">
                  <div className="code-block-header">
                    <Terminal size={13} />
                    <span>{match[1]}</span>
                  </div>
                  <pre>
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                </div>
              );
            }
            if (!inline) {
              return (
                <div className="code-block">
                  <pre>
                    <code {...props}>{children}</code>
                  </pre>
                </div>
              );
            }
            return (
              <code className="inline-code" {...props}>
                {children}
              </code>
            );
          },
          table({ children }) {
            return (
              <div className="table-wrap">
                <table>{children}</table>
              </div>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
      {isStreaming && <span className="cursor-blink" />}
      <div ref={endRef} />
    </div>
  );
}

export default function App() {
  const [repoPath, setRepoPath] = useState('D:/clawdex');
  const [mode, setMode] = useState('summary');
  const [status, setStatus] = useState('idle'); // idle | streaming | complete | error
  const [streamedText, setStreamedText] = useState('');
  const [error, setError] = useState('');
  const [tools, setTools] = useState([]);
  const [phase, setPhase] = useState('');
  const eventSourceRef = useRef(null);

  const stopStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  function runInspection() {
    stopStream();
    setStatus('streaming');
    setStreamedText('');
    setError('');
    setTools([]);
    setPhase('connecting');

    const params = new URLSearchParams({ repoPath, mode });
    const es = new EventSource(`/api/repo-inspect/stream?${params}`);
    eventSourceRef.current = es;

    es.addEventListener('text_delta', (e) => {
      const { delta } = JSON.parse(e.data);
      if (delta) {
        setStreamedText((prev) => prev + delta);
      }
    });

    es.addEventListener('tool_start', (e) => {
      const { tool } = JSON.parse(e.data);
      setTools((prev) => [...prev, { name: tool, done: false }]);
      setPhase('using tools');
    });

    es.addEventListener('tool_end', (e) => {
      const { tool } = JSON.parse(e.data);
      setTools((prev) =>
        prev.map((t) => (t.name === tool && !t.done ? { ...t, done: true } : t)),
      );
    });

    es.addEventListener('status', (e) => {
      const { phase: p } = JSON.parse(e.data);
      if (p === 'thinking') setPhase('thinking');
      else if (p === 'started') setPhase('started');
      else if (p === 'turn_complete') setPhase('writing');
    });

    es.addEventListener('complete', (e) => {
      const { text, aborted } = JSON.parse(e.data);
      // If we didn't get streamed text, use the final assembled text
      setStreamedText((prev) => (prev.trim() ? prev : text));
      setStatus(aborted ? 'error' : 'complete');
      setPhase('');
      if (aborted) setError('Inspection was aborted.');
      es.close();
      eventSourceRef.current = null;
    });

    es.addEventListener('error_event', (e) => {
      const { message } = JSON.parse(e.data);
      setError(message);
      setStatus('error');
      es.close();
      eventSourceRef.current = null;
    });

    // Also handle the SSE 'error' event name from sendSSE
    es.addEventListener('error', (e) => {
      // Check if it's a custom error event with data
      if (e.data) {
        try {
          const { message } = JSON.parse(e.data);
          setError(message);
        } catch {
          setError('Connection lost');
        }
      } else if (status !== 'complete') {
        // Only set error if we haven't completed
        setError('Connection to server lost');
      }
      setStatus((prev) => (prev === 'complete' ? prev : 'error'));
      es.close();
      eventSourceRef.current = null;
    });
  }

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  const isRunning = status === 'streaming';
  const selectedMode = MODES.find((m) => m.id === mode);

  return (
    <div className="app-shell">
      <header className="hero fade-in">
        <div className="hero-top">
          <div className="logo">
            <GitBranch size={22} />
          </div>
          <div className="badge">Clawx Programmatic Example</div>
        </div>
        <h1>
          Repo Maintainer
          <Sparkles size={28} className="sparkle" />
        </h1>
        <p>
          Inspect and reason about repositories using AI — powered by Clawx.
        </p>
      </header>

      <main className="layout">
        <section className="panel controls fade-in-up delay-1">
          <h2>
            <FolderSearch size={18} />
            Configure Inspection
          </h2>

          <div className="field">
            <label htmlFor="repo-path">Repository path</label>
            <div className="input-wrap">
              <GitBranch size={16} className="input-icon" />
              <input
                id="repo-path"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="/path/to/your/repo"
              />
            </div>
          </div>

          <div className="field">
            <label>Analysis mode</label>
            <div className="mode-cards">
              {MODES.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    className={`mode-card ${mode === item.id ? 'selected' : ''}`}
                    onClick={() => setMode(item.id)}
                  >
                    <Icon size={18} />
                    <div>
                      <div className="mode-card-label">{item.label}</div>
                      <div className="mode-card-desc">{item.description}</div>
                    </div>
                    {mode === item.id && <ChevronRight size={16} className="mode-check" />}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            className="run-btn"
            onClick={runInspection}
            disabled={isRunning || !repoPath.trim()}
          >
            {isRunning ? (
              <>
                <Loader2 size={18} className="spin" />
                Inspecting...
              </>
            ) : (
              <>
                <Play size={18} />
                Run Inspection
              </>
            )}
          </button>
        </section>

        <section className="panel output fade-in-up delay-2">
          <div className="output-header">
            <h2>
              {selectedMode && React.createElement(selectedMode.icon, { size: 18 })}
              Result
            </h2>
            {isRunning && phase && (
              <div className="phase-badge">
                <Loader2 size={13} className="spin" />
                {phase}
              </div>
            )}
            {status === 'complete' && (
              <div className="phase-badge complete">
                <CheckCircle2 size={13} />
                Complete
              </div>
            )}
          </div>

          <ToolActivity tools={tools} />

          {error && (
            <div className="error fade-in">
              <XCircle size={16} />
              {error}
            </div>
          )}

          {!error && !streamedText && !isRunning && (
            <div className="empty fade-in">
              <Wrench size={36} className="empty-icon" />
              <div className="empty-title">No inspection yet</div>
              <div className="empty-sub">
                Configure and run an inspection to see AI-generated analysis here.
              </div>
            </div>
          )}

          {isRunning && !streamedText && (
            <div className="empty fade-in">
              <Loader2 size={36} className="spin empty-icon" />
              <div className="empty-title">Clawx is inspecting the repository...</div>
              <div className="empty-sub">
                The AI agent is reading files, analyzing structure, and reasoning about the codebase.
              </div>
            </div>
          )}

          {streamedText && <StreamingOutput text={streamedText} isStreaming={isRunning} />}
        </section>
      </main>
    </div>
  );
}
