import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Monitor,
  HardDrive,
  Cpu,
  PackageSearch,
  FolderOpen,
  Play,
  Loader2,
  Wrench,
  CheckCircle2,
  XCircle,
  Zap,
  ChevronRight,
  Terminal,
  Server,
  Bookmark,
} from 'lucide-react';

const MODES = [
  {
    id: 'summary',
    label: 'System Summary',
    description: 'Overview of the workspace and environment',
    icon: Monitor,
  },
  {
    id: 'resources',
    label: 'Disk / Resources',
    description: 'Inspect directories and resource health',
    icon: HardDrive,
  },
  {
    id: 'runtime',
    label: 'Runtime / Tooling',
    description: 'Node, Python, git and dev tool state',
    icon: Cpu,
  },
  {
    id: 'inventory',
    label: 'Apps / Inventory',
    description: 'Discover services, projects, and apps',
    icon: PackageSearch,
  },
];

const PRESETS = [
  { label: 'Clawx repo', value: 'D:/clawdex', icon: Server },
  { label: 'Programmatic example', value: 'D:/clawdex/examples/programmatic-react-express', icon: FolderOpen },
  { label: 'Repo maintainer app', value: 'D:/clawdex/examples/repo-maintainer-app', icon: FolderOpen },
  { label: 'Current directory', value: '.', icon: Terminal },
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
  const [targetPath, setTargetPath] = useState('D:/clawdex');
  const [mode, setMode] = useState('summary');
  const [status, setStatus] = useState('idle');
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

    const params = new URLSearchParams({ targetPath, mode });
    const es = new EventSource(`/api/inspect/stream?${params}`);
    eventSourceRef.current = es;

    es.addEventListener('text_delta', (e) => {
      const { delta } = JSON.parse(e.data);
      if (delta) setStreamedText((prev) => prev + delta);
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
      setStreamedText((prev) => (prev.trim() ? prev : text));
      setStatus(aborted ? 'error' : 'complete');
      setPhase('');
      if (aborted) setError('Inspection was aborted.');
      es.close();
      eventSourceRef.current = null;
    });

    es.addEventListener('error', (e) => {
      if (e.data) {
        try {
          const { message } = JSON.parse(e.data);
          setError(message);
        } catch {
          setError('Connection lost');
        }
      } else if (status !== 'complete') {
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
            <Server size={22} />
          </div>
          <div className="badge">Clawx Programmatic Example</div>
        </div>
        <h1>
          Ops Copilot
          <Zap size={28} className="zap" />
        </h1>
        <p>
          AI-powered environment and operations inspection — powered by Clawx.
        </p>
      </header>

      <main className="layout">
        <section className="panel controls fade-in-up delay-1">
          <h2>
            <Monitor size={18} />
            Configure Inspection
          </h2>

          <div className="field">
            <label>Quick presets</label>
            <div className="preset-grid">
              {PRESETS.map((preset) => {
                const Icon = preset.icon;
                return (
                  <button
                    key={preset.label}
                    className={`preset-btn ${targetPath === preset.value ? 'active' : ''}`}
                    onClick={() => setTargetPath(preset.value)}
                  >
                    <Icon size={14} />
                    <span>{preset.label}</span>
                    {targetPath === preset.value && <Bookmark size={12} className="preset-check" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label htmlFor="target-path">Target path</label>
            <div className="input-wrap">
              <FolderOpen size={16} className="input-icon" />
              <input
                id="target-path"
                value={targetPath}
                onChange={(e) => setTargetPath(e.target.value)}
                placeholder="/path/to/environment"
              />
            </div>
          </div>

          <div className="field">
            <label>Inspection mode</label>
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
            disabled={isRunning || !targetPath.trim()}
          >
            {isRunning ? (
              <>
                <Loader2 size={18} className="spin" />
                Scanning...
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
                Pick a target and mode, then run an inspection to see AI-generated analysis.
              </div>
            </div>
          )}

          {isRunning && !streamedText && (
            <div className="empty fade-in">
              <Loader2 size={36} className="spin empty-icon" />
              <div className="empty-title">Scanning the environment...</div>
              <div className="empty-sub">
                The AI agent is probing the filesystem, checking tools, and reasoning about what it finds.
              </div>
            </div>
          )}

          {streamedText && <StreamingOutput text={streamedText} isStreaming={isRunning} />}
        </section>
      </main>
    </div>
  );
}
