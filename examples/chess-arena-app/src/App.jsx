import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Chess } from 'chess.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Cpu,
  User,
  Play,
  Pause,
  RotateCcw,
  Zap,
  Loader2,
  Crown,
  Swords,
  Clock,
  ChevronRight,
  Brain,
  Bot,
  Gauge,
  Terminal,
} from 'lucide-react';

/* ── Piece rendering ─────────────────────────────────────────── */
const PIECE_CHARS = {
  wk: '\u2654', wq: '\u2655', wr: '\u2656', wb: '\u2657', wn: '\u2658', wp: '\u2659',
  bk: '\u265A', bq: '\u265B', br: '\u265C', bb: '\u265D', bn: '\u265E', bp: '\u265F',
};

const PIECE_NAMES = { k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn' };

function pieceChar(sq) {
  if (!sq) return null;
  return PIECE_CHARS[`${sq.color}${sq.type}`] || null;
}

/* ── Heuristic move selection (fast / offline fallback) ─────── */
function chooseHeuristicMove(game, style) {
  const moves = game.moves({ verbose: true });
  if (!moves.length) return null;
  const captures = moves.filter((m) => m.captured);
  const checks = moves.filter((m) => m.san.includes('+') || m.san.includes('#'));
  const center = moves.filter((m) => ['d4', 'd5', 'e4', 'e5'].includes(m.to));
  let pool = moves;
  if (style === 'aggressive') pool = captures.length ? captures : checks.length ? checks : moves;
  if (style === 'positional') pool = center.length ? center : moves;
  if (style === 'chaotic') pool = [...moves].sort(() => Math.random() - 0.5);
  return pool[Math.floor(Math.random() * pool.length)] || moves[0];
}

/* ── Game status text ────────────────────────────────────────── */
function getStatus(game) {
  if (game.isCheckmate()) return { text: `Checkmate — ${game.turn() === 'w' ? 'Black' : 'White'} wins!`, type: 'end' };
  if (game.isDraw()) return { text: 'Draw', type: 'end' };
  if (game.isStalemate()) return { text: 'Stalemate — Draw', type: 'end' };
  if (game.isThreefoldRepetition()) return { text: 'Threefold repetition — Draw', type: 'end' };
  if (game.isInsufficientMaterial()) return { text: 'Insufficient material — Draw', type: 'end' };
  if (game.inCheck()) return { text: `${game.turn() === 'w' ? 'White' : 'Black'} in check!`, type: 'check' };
  return { text: `${game.turn() === 'w' ? 'White' : 'Black'} to move`, type: 'normal' };
}

/* ── Captured pieces ─────────────────────────────────────────── */
function getCaptured(history) {
  const w = []; // pieces captured BY white (black's pieces)
  const b = [];
  for (const m of history) {
    if (m.captured) {
      const char = PIECE_CHARS[`${m.color === 'w' ? 'b' : 'w'}${m.captured}`];
      if (m.color === 'w') w.push(char);
      else b.push(char);
    }
  }
  return { white: w, black: b };
}

/* ── Game modes ──────────────────────────────────────────────── */
const MODES = [
  { id: 'ai-vs-ai', label: 'AI vs AI', desc: 'Watch two Clawx agents battle', icon: Bot },
  { id: 'human-white', label: 'Play as White', desc: 'You vs Clawx AI', icon: User },
  { id: 'human-black', label: 'Play as Black', desc: 'Clawx AI vs You', icon: User },
  { id: 'fast', label: 'Fast Autoplay', desc: 'Heuristic-only (no AI)', icon: Gauge },
];

const SPEED_LABELS = { slow: 'Slow', normal: 'Normal', fast: 'Fast' };

/* ── AI Thinking Panel ───────────────────────────────────────── */
function AIThinkingPanel({ reasoning, isThinking, thinkingFor, moveCount }) {
  const endRef = useRef(null);

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [reasoning]);

  if (!reasoning && !isThinking) {
    return (
      <div className="thinking-panel empty-thinking">
        <Brain size={32} className="empty-icon" />
        <div className="empty-title">Clawx AI Reasoning</div>
        <div className="empty-sub">
          When the AI makes a move, its analysis and reasoning will stream here in real-time.
          This shows Clawx's <code>runAgent</code> with <code>onEvent</code> streaming.
        </div>
      </div>
    );
  }

  return (
    <div className={`thinking-panel ${isThinking ? 'active' : ''}`}>
      <div className="thinking-header">
        {isThinking ? (
          <>
            <Loader2 size={14} className="spin" />
            <span>Clawx analyzing for {thinkingFor}...</span>
          </>
        ) : (
          <>
            <Brain size={14} />
            <span>Move {moveCount} reasoning</span>
          </>
        )}
      </div>
      <div className="thinking-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}
          components={{
            code({ inline, className, children, ...props }) {
              if (!inline) {
                return (
                  <div className="code-block">
                    <pre><code {...props}>{children}</code></pre>
                  </div>
                );
              }
              return <code className="inline-code" {...props}>{children}</code>;
            },
          }}
        >
          {reasoning}
        </ReactMarkdown>
        {isThinking && <span className="cursor-blink" />}
        <div ref={endRef} />
      </div>
    </div>
  );
}

/* ── Chessboard ──────────────────────────────────────────────── */
function Chessboard({ board, selectedSquare, legalTargets, lastMove, onSquareClick, flipped }) {
  const fileLabels = flipped ? 'hgfedcba' : 'abcdefgh';
  const rankLabels = flipped ? '12345678' : '87654321';

  return (
    <div className="board-container">
      <div className="board-files">
        {fileLabels.split('').map((f) => <span key={f}>{f}</span>)}
      </div>
      <div className="board-ranks">
        {rankLabels.split('').map((r) => <span key={r}>{r}</span>)}
      </div>
      <div className="board">
        {Array.from({ length: 8 }, (_, displayRow) =>
          Array.from({ length: 8 }, (_, displayCol) => {
            const boardRow = flipped ? 7 - displayRow : displayRow;
            const boardCol = flipped ? 7 - displayCol : displayCol;
            const sq = board[boardRow][boardCol];
            const file = 'abcdefgh'[boardCol];
            const rank = 8 - boardRow;
            const sqName = `${file}${rank}`;
            const dark = (boardRow + boardCol) % 2 === 1;
            const piece = pieceChar(sq);
            const isSelected = selectedSquare === sqName;
            const isTarget = legalTargets.includes(sqName);
            const isLastFrom = lastMove?.from === sqName;
            const isLastTo = lastMove?.to === sqName;

            let classes = `square ${dark ? 'dark' : 'light'}`;
            if (isSelected) classes += ' selected';
            if (isTarget) classes += ' target';
            if (isLastFrom || isLastTo) classes += ' last-move';

            return (
              <div
                key={sqName}
                className={classes}
                onClick={() => onSquareClick(sqName, sq)}
              >
                {piece && <span className={`piece ${sq.color === 'w' ? 'white-piece' : 'black-piece'}`}>{piece}</span>}
                {isTarget && !piece && <div className="target-dot" />}
                {isTarget && piece && <div className="target-ring" />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ── Move History ────────────────────────────────────────────── */
function MoveHistory({ moves }) {
  const endRef = useRef(null);
  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [moves.length]);

  const pairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      num: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1] || null,
    });
  }

  return (
    <div className="history">
      {pairs.length === 0 ? (
        <div className="history-empty">Moves will appear here...</div>
      ) : (
        pairs.map((p) => (
          <div key={p.num} className="move-pair">
            <span className="move-num">{p.num}.</span>
            <span className="move-white">{p.white}</span>
            {p.black && <span className="move-black">{p.black}</span>}
          </div>
        ))
      )}
      <div ref={endRef} />
    </div>
  );
}

/* ── Main App ────────────────────────────────────────────────── */
export default function App() {
  const [game, setGame] = useState(() => new Chess());
  const [moveHistory, setMoveHistory] = useState([]);
  const [verboseHistory, setVerboseHistory] = useState([]);
  const [gameMode, setGameMode] = useState('ai-vs-ai');
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState('normal');
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiReasoning, setAiReasoning] = useState('');
  const [thinkingFor, setThinkingFor] = useState('');
  const [aiMoveCount, setAiMoveCount] = useState(0);
  const eventSourceRef = useRef(null);
  const timeoutRef = useRef(null);

  const board = useMemo(() => game.board(), [game]);
  const status = getStatus(game);
  const captured = useMemo(() => getCaptured(verboseHistory), [verboseHistory]);
  const flipped = gameMode === 'human-black';

  const isHumanTurn = useCallback(() => {
    if (gameMode === 'human-white' && game.turn() === 'w') return true;
    if (gameMode === 'human-black' && game.turn() === 'b') return true;
    return false;
  }, [gameMode, game]);

  const stopAll = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    clearTimeout(timeoutRef.current);
  }, []);

  /* ── Make a move on the board ─────────────────────────────── */
  function applyMove(san) {
    const next = new Chess(game.fen());
    const move = next.move(san);
    if (!move) return false;
    setGame(next);
    setMoveHistory((prev) => [...prev, move.san]);
    setVerboseHistory((prev) => [...prev, move]);
    setLastMove({ from: move.from, to: move.to });
    setSelectedSquare(null);
    setLegalTargets([]);
    return true;
  }

  /* ── Request AI move from Clawx via SSE ───────────────────── */
  function requestAIMove(currentGame) {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setAiThinking(true);
    setAiReasoning('');
    const color = currentGame.turn() === 'w' ? 'White' : 'Black';
    setThinkingFor(color);

    const params = new URLSearchParams({
      fen: currentGame.fen(),
      moveHistory: moveHistory.join(','),
    });
    const es = new EventSource(`/api/move/stream?${params}`);
    eventSourceRef.current = es;

    let fullReasoning = '';

    es.addEventListener('text_delta', (e) => {
      const { delta } = JSON.parse(e.data);
      if (delta) {
        fullReasoning += delta;
        setAiReasoning(fullReasoning);
      }
    });

    es.addEventListener('move', (e) => {
      const { move, reasoning } = JSON.parse(e.data);
      if (reasoning && !fullReasoning.trim()) {
        setAiReasoning(reasoning);
      }
      setAiThinking(false);
      setAiMoveCount((c) => c + 1);

      // Apply the move
      const next = new Chess(currentGame.fen());
      const applied = next.move(move);
      if (applied) {
        setGame(next);
        setMoveHistory((prev) => [...prev, applied.san]);
        setVerboseHistory((prev) => [...prev, applied]);
        setLastMove({ from: applied.from, to: applied.to });
      }

      es.close();
      eventSourceRef.current = null;
    });

    es.addEventListener('error', () => {
      setAiThinking(false);
      es.close();
      eventSourceRef.current = null;

      // Fallback to heuristic
      const move = chooseHeuristicMove(currentGame, 'positional');
      if (move) {
        const next = new Chess(currentGame.fen());
        next.move(move);
        setGame(next);
        setMoveHistory((prev) => [...prev, move.san]);
        setVerboseHistory((prev) => [...prev, move]);
        setLastMove({ from: move.from, to: move.to });
        setAiReasoning((prev) => prev + '\n\n*(Clawx unavailable — used heuristic fallback)*');
      }
    });
  }

  /* ── Fast heuristic move (no AI) ──────────────────────────── */
  function doHeuristicMove(currentGame) {
    const style = currentGame.turn() === 'w' ? 'positional' : 'aggressive';
    const move = chooseHeuristicMove(currentGame, style);
    if (!move) return;
    const next = new Chess(currentGame.fen());
    next.move(move);
    setGame(next);
    setMoveHistory((prev) => [...prev, move.san]);
    setVerboseHistory((prev) => [...prev, move]);
    setLastMove({ from: move.from, to: move.to });
  }

  /* ── AI vs AI / Fast autoplay loop ────────────────────────── */
  useEffect(() => {
    if (!running || game.isGameOver()) return;

    // In human modes, only auto-move for the AI side
    if (gameMode === 'human-white' || gameMode === 'human-black') {
      if (isHumanTurn()) return; // Wait for human
      // AI's turn
      if (!aiThinking) {
        timeoutRef.current = setTimeout(() => requestAIMove(game), 400);
      }
      return () => clearTimeout(timeoutRef.current);
    }

    if (gameMode === 'fast') {
      const delays = { slow: 800, normal: 400, fast: 120 };
      timeoutRef.current = setTimeout(() => doHeuristicMove(game), delays[speed]);
      return () => clearTimeout(timeoutRef.current);
    }

    // AI vs AI: request moves sequentially
    if (gameMode === 'ai-vs-ai' && !aiThinking) {
      timeoutRef.current = setTimeout(() => requestAIMove(game), 600);
      return () => clearTimeout(timeoutRef.current);
    }
  }, [game, running, gameMode, speed, aiThinking]);

  /* ── Human click-to-move ───────────────────────────────────── */
  function handleSquareClick(sqName, sq) {
    if (!running || !isHumanTurn() || game.isGameOver()) return;

    if (selectedSquare) {
      // Try to move to clicked square
      const moveMade = tryHumanMove(selectedSquare, sqName);
      if (!moveMade) {
        // If clicked own piece, select it instead
        if (sq && sq.color === game.turn()) {
          selectPiece(sqName);
        } else {
          setSelectedSquare(null);
          setLegalTargets([]);
        }
      }
    } else if (sq && sq.color === game.turn()) {
      selectPiece(sqName);
    }
  }

  function selectPiece(sqName) {
    setSelectedSquare(sqName);
    const moves = game.moves({ square: sqName, verbose: true });
    setLegalTargets(moves.map((m) => m.to));
  }

  function tryHumanMove(from, to) {
    const next = new Chess(game.fen());
    // Try with promotion to queen for pawns
    let move = next.move({ from, to, promotion: 'q' });
    if (!move) move = next.move({ from, to });
    if (!move) return false;
    setGame(next);
    setMoveHistory((prev) => [...prev, move.san]);
    setVerboseHistory((prev) => [...prev, move]);
    setLastMove({ from: move.from, to: move.to });
    setSelectedSquare(null);
    setLegalTargets([]);
    return true;
  }

  /* ── Reset ─────────────────────────────────────────────────── */
  function resetGame() {
    stopAll();
    setGame(new Chess());
    setMoveHistory([]);
    setVerboseHistory([]);
    setLastMove(null);
    setSelectedSquare(null);
    setLegalTargets([]);
    setRunning(false);
    setAiThinking(false);
    setAiReasoning('');
    setAiMoveCount(0);
  }

  function startGame() {
    if (game.isGameOver()) resetGame();
    setRunning(true);
  }

  useEffect(() => {
    return () => stopAll();
  }, [stopAll]);

  const usesClawx = gameMode !== 'fast';
  const modeInfo = MODES.find((m) => m.id === gameMode);

  return (
    <div className="app-shell">
      <header className="hero fade-in">
        <div className="hero-top">
          <div className="logo">
            <Crown size={22} />
          </div>
          <div className="badge">
            <Zap size={11} />
            Powered by Clawx
          </div>
        </div>
        <h1>
          Chess Arena
          <Swords size={28} className="swords" />
        </h1>
        <p>
          AI chess powered by <strong>Clawx</strong> — watch agents reason about positions in real-time
          via <code>runAgent</code> with streamed <code>onEvent</code> callbacks, or play against the AI yourself.
        </p>
      </header>

      <main className="layout">
        {/* ── Left: Board ────────────────────────────────────── */}
        <div className="board-column fade-in-up delay-1">
          <div className="panel board-panel">
            <div className="board-top">
              <div className={`status-bar ${status.type}`}>
                {status.type === 'end' && <Crown size={16} />}
                {status.type === 'check' && <Zap size={16} />}
                {status.text}
              </div>
              {aiThinking && usesClawx && (
                <div className="ai-badge">
                  <Loader2 size={13} className="spin" />
                  Clawx thinking...
                </div>
              )}
            </div>

            <div className="captured-row">
              <div className="captured black-captured">
                {captured.white.map((p, i) => <span key={i}>{p}</span>)}
              </div>
              <div className="captured white-captured">
                {captured.black.map((p, i) => <span key={i}>{p}</span>)}
              </div>
            </div>

            <Chessboard
              board={board}
              selectedSquare={selectedSquare}
              legalTargets={legalTargets}
              lastMove={lastMove}
              onSquareClick={handleSquareClick}
              flipped={flipped}
            />

            <div className="board-actions">
              {!running ? (
                <button className="btn btn-primary" onClick={startGame}>
                  <Play size={16} /> Start Game
                </button>
              ) : (
                <button className="btn btn-secondary" onClick={() => { stopAll(); setRunning(false); }}>
                  <Pause size={16} /> Pause
                </button>
              )}
              <button className="btn btn-outline" onClick={resetGame}>
                <RotateCcw size={16} /> Reset
              </button>
            </div>
          </div>
        </div>

        {/* ── Right: Controls + Reasoning ────────────────────── */}
        <div className="info-column fade-in-up delay-2">
          {/* Mode Selection */}
          <div className="panel">
            <h2><Swords size={16} /> Game Mode</h2>
            <div className="mode-grid">
              {MODES.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    className={`mode-card ${gameMode === m.id ? 'selected' : ''}`}
                    onClick={() => { if (!running) { setGameMode(m.id); resetGame(); } }}
                    disabled={running}
                  >
                    <Icon size={16} />
                    <div>
                      <div className="mode-label">{m.label}</div>
                      <div className="mode-desc">{m.desc}</div>
                    </div>
                    {gameMode === m.id && <ChevronRight size={14} className="mode-check" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Speed (fast mode only) */}
          {gameMode === 'fast' && (
            <div className="panel fade-in">
              <h2><Clock size={16} /> Speed</h2>
              <div className="speed-row">
                {Object.entries(SPEED_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    className={`speed-btn ${speed === key ? 'active' : ''}`}
                    onClick={() => setSpeed(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clawx Integration Info */}
          {usesClawx && (
            <div className="panel clawx-info fade-in">
              <h2><Terminal size={16} /> How Clawx Powers This</h2>
              <div className="info-steps">
                <div className="info-step">
                  <div className="step-num">1</div>
                  <div>Board FEN sent to Express server via <strong>Server-Sent Events</strong></div>
                </div>
                <div className="info-step">
                  <div className="step-num">2</div>
                  <div>Server calls <code>runAgent(config, {'{'} prompt, onEvent, noTools: true {'}'})</code></div>
                </div>
                <div className="info-step">
                  <div className="step-num">3</div>
                  <div><code>onEvent</code> streams <strong>text_delta</strong> events back to the browser</div>
                </div>
                <div className="info-step">
                  <div className="step-num">4</div>
                  <div>Move is parsed from response and applied to the board</div>
                </div>
              </div>
            </div>
          )}

          {/* AI Reasoning */}
          {usesClawx && (
            <AIThinkingPanel
              reasoning={aiReasoning}
              isThinking={aiThinking}
              thinkingFor={thinkingFor}
              moveCount={aiMoveCount}
            />
          )}

          {/* Move History */}
          <div className="panel">
            <h2><Clock size={16} /> Moves ({moveHistory.length})</h2>
            <MoveHistory moves={moveHistory} />
          </div>
        </div>
      </main>
    </div>
  );
}
