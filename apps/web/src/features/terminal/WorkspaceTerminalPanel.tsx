import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { FitAddon } from "xterm-addon-fit";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";
import type { RunJobPublicDto, RunLogEntryDto } from "@itecify/shared/runner";
import type { RunStreamState } from "../run/useWorkspaceRun.js";
import {
  useWorkspaceTerminal,
  type TerminalLinePreviewServerMessage,
} from "./useWorkspaceTerminal.js";

type ViewerPreviewState = { active: boolean };

function focusTerminal(term: Terminal | null): void {
  if (!term) return;
  queueMicrotask(() => {
    requestAnimationFrame(() => {
      term.focus();
    });
  });
}

function sanitizeTypingLine(s: string): string {
  return s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

/**
 * Linie „live” pentru spectatori: mereu aceeași linie fizică (fără \\x1b[1A — acela muta cursorul
 * pe linia de deasupra și lăsa resturi „n”, „no” și drift orizontal).
 */
function writeViewerTypingLine(
  term: Terminal,
  holderName: string,
  text: string,
  state: MutableRefObject<ViewerPreviewState>,
): void {
  const safe = sanitizeTypingLine(text);
  const label = holderName.trim() || "operator";
  const prefix = `\x1b[90m[typing] ${label}>\x1b[0m `;

  if (text.length === 0) {
    if (state.current.active) {
      term.write("\r\x1b[2K");
      state.current.active = false;
    }
    return;
  }

  if (!state.current.active) {
    term.write(`\r\n${prefix}${safe}\x1b[K`);
    state.current.active = true;
  } else {
    term.write(`\r\x1b[2K\r${prefix}${safe}\x1b[K`);
  }
}

/** Înainte de stdout/stderr: șterge vizual linia [typing]; doar flag=false lăsa text pe ecran. */
function clearViewerTypingLineIfActive(
  term: Terminal,
  state: MutableRefObject<ViewerPreviewState>,
): void {
  if (state.current.active) {
    term.write("\r\x1b[2K");
    state.current.active = false;
  }
}

const HELP_TEXT = `\r\n\x1b[36m[operator]\x1b[0m Mod consolă (același flux Run ca panoul de jos). Comenzi:\r\n  \x1b[1mhelp\x1b[0m     — această listă\r\n  \x1b[1mrun\x1b[0m      — Scan + Build + Run (POST /jobs)\r\n  \x1b[1mshell\x1b[0m    — mod shell: linii către container (docker exec); \x1b[1mexit\x1b[0m revine aici\r\n  \x1b[1mstatus\x1b[0m   — starea jobului\r\n  \x1b[1mlogs\x1b[0m      — ultimele linii din logul pipeline\r\n  \x1b[1mclear\x1b[0m     — curăță ecranul (toți)\r\n  \x1b[1mrelease\x1b[0m   — eliberezi controlul\r\nAlte linii (în afara modului shell) merg tot la shell-ul sandbox.\r\n`;

function formatOperatorStatus(
  job: RunJobPublicDto | null,
  streamState: RunStreamState,
  runError: string | null,
  templateLabel: string,
): string {
  if (!job) {
    return `\r\n\x1b[36m[operator]\x1b[0m Niciun job activ. Rulează \x1b[1mrun\x1b[0m sau folosește panoul Run (${templateLabel}).\r\n`;
  }
  const stages = job.stages;
  return (
    `\r\n\x1b[36m[operator]\x1b[0m job=${job.id.slice(0, 10)}… status=\x1b[1m${job.status}\x1b[0m stream=${streamState}\r\n` +
    `  scan=${stages.scanning.status} build=${stages.building.status} run=${stages.running.status}\r\n` +
    (runError ? `  lastError: ${runError}\r\n` : "")
  );
}

function formatLogsTail(entries: RunLogEntryDto[], maxLines: number): string {
  const slice = entries.slice(-maxLines);
  if (slice.length === 0) {
    return `\r\n\x1b[36m[operator]\x1b[0m Nu există încă linii de log pentru acest job.\r\n`;
  }
  let out = `\r\n\x1b[36m[operator]\x1b[0m Ultimele ${slice.length} linii:\r\n`;
  for (const e of slice) {
    const line = e.chunk.replace(/\r?\n/g, " ");
    out += `  \x1b[90m[${e.stream}]\x1b[0m ${line}\r\n`;
  }
  return out;
}

export type WorkspaceTerminalOperatorRunner = {
  startRun: () => Promise<{ ok: true } | { ok: false; message: string }>;
  job: RunJobPublicDto | null;
  liveLogs: RunLogEntryDto[];
  streamState: RunStreamState;
  isStarting: boolean;
  canStart: boolean;
  runError: string | null;
  templateLabel: string;
};

export function WorkspaceTerminalPanel({
  workspaceId,
  currentUserId,
  currentUserName,
  wsEnabled,
  onBeforeEnsureSandbox,
  operatorRunner,
}: {
  workspaceId: string;
  currentUserId: string;
  currentUserName: string;
  wsEnabled: boolean;
  onBeforeEnsureSandbox: () => Promise<void>;
  operatorRunner: WorkspaceTerminalOperatorRunner;
}): ReactNode {
  const [shellMode, setShellMode] = useState(false);
  const shellModeRef = useRef(false);
  const previewStateRef = useRef<ViewerPreviewState>({ active: false });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termInstanceRef = useRef<Terminal | null>(null);
  const lineBufferRef = useRef("");
  const isTypistRef = useRef(false);
  const lastPrintedLogSequenceRef = useRef(0);
  const lastLogJobIdRef = useRef<string | null>(null);
  /**
   * După ultima ieșire WS (shell/operator binar): cursor pe linie nouă completă?
   * Dacă false, la primul caracter al comenzii următoare inserăm \\r\\n ca să nu tastezi „la dreapta” output-ului.
   */
  const shellEndedWithNewlineRef = useRef(true);

  const operatorRunnerRef = useRef(operatorRunner);
  operatorRunnerRef.current = operatorRunner;

  useEffect(() => {
    shellModeRef.current = shellMode;
  }, [shellMode]);

  const terminal = useWorkspaceTerminal({
    workspaceId,
    currentUserId,
    wsEnabled,
    onBeforeEnsureSandbox,
    onLinePreview: (msg: TerminalLinePreviewServerMessage) => {
      const t = termInstanceRef.current;
      if (!t) return;
      writeViewerTypingLine(t, msg.holderName ?? "", msg.text, previewStateRef);
    },
    onShellOutput: () => {
      const t = termInstanceRef.current;
      if (!t) return;
      clearViewerTypingLineIfActive(t, previewStateRef);
    },
    onTypistShellBinary: (decodedUtf8: string) => {
      if (decodedUtf8.length === 0) return;
      const last = decodedUtf8[decodedUtf8.length - 1];
      shellEndedWithNewlineRef.current = last === "\n" || last === "\r";
    },
  });

  const sendShellStdinRef = useRef(terminal.sendShellStdin);
  sendShellStdinRef.current = terminal.sendShellStdin;
  const broadcastOperatorTextRef = useRef(terminal.broadcastOperatorText);
  broadcastOperatorTextRef.current = terminal.broadcastOperatorText;
  const releaseTypistRef = useRef(terminal.releaseTypist);
  releaseTypistRef.current = terminal.releaseTypist;
  const syncLinePreviewRef = useRef(terminal.syncLinePreview);
  syncLinePreviewRef.current = terminal.syncLinePreview;
  const sendCommandEchoRef = useRef(terminal.sendCommandEcho);
  sendCommandEchoRef.current = terminal.sendCommandEcho;

  useEffect(() => {
    isTypistRef.current = terminal.isTypist;
  }, [terminal.isTypist]);

  useEffect(() => {
    if (!terminal.sandboxActive) {
      return;
    }
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "Consolas, 'Courier New', monospace",
      fontSize: 13,
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#aeafad",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();
    fitRef.current = fit;
    termInstanceRef.current = term;
    terminal.setTerminal(term);

    const handleLine = async (rawLine: string): Promise<void> => {
      const broadcast = (text: string): void => {
        broadcastOperatorTextRef.current(text);
      };

      if (shellModeRef.current) {
        const t = rawLine.trim();
        if (t.toLowerCase() === "exit") {
          if (rawLine.length > 0) {
            sendCommandEchoRef.current(rawLine);
          }
          shellModeRef.current = false;
          setShellMode(false);
          broadcast(
            "\r\n\x1b[36m[operator]\x1b[0m Mod operator (help, run, shell). Liniile nu mai merg direct la container.\r\n",
          );
          return;
        }
        if (rawLine.length > 0) {
          sendCommandEchoRef.current(rawLine);
        }
        sendShellStdinRef.current(rawLine + "\n");
        return;
      }

      const line = rawLine.trim();
      if (line.length === 0) return;

      sendCommandEchoRef.current(rawLine);

      const op = operatorRunnerRef.current;
      const cmd = line.split(/\s+/)[0]?.toLowerCase() ?? "";

      switch (cmd) {
        case "help":
          broadcast(HELP_TEXT);
          return;
        case "run": {
          broadcast(
            "\r\n\x1b[36m[operator]\x1b[0m Pornire pipeline (același cod ca butonul Scan + Build + Run)…\r\n",
          );
          const result = await op.startRun();
          if (result.ok) {
            broadcast(
              "\x1b[32m[operator]\x1b[0m Job creat; urmărește etapele în panoul Run și logurile de mai jos.\r\n",
            );
          } else {
            broadcast(`\x1b[31m[operator]\x1b[0m ${result.message}\r\n`);
          }
          return;
        }
        case "shell":
          shellModeRef.current = true;
          setShellMode(true);
          broadcast(
            "\r\n\x1b[36m[operator]\x1b[0m \x1b[1mMod shell\x1b[0m: fiecare linie se trimite la container (docker exec). Tastează \x1b[1mexit\x1b[0m pentru revenire.\r\n",
          );
          return;
        case "status":
          broadcast(
            formatOperatorStatus(
              op.job,
              op.streamState,
              op.runError,
              op.templateLabel,
            ),
          );
          return;
        case "logs":
          broadcast(formatLogsTail(op.liveLogs, 40));
          return;
        case "clear":
          broadcast("\x1b[2J\x1b[H");
          return;
        case "release":
          releaseTypistRef.current();
          broadcast("\r\n\x1b[36m[operator]\x1b[0m Control eliberat.\r\n");
          return;
        default:
          sendShellStdinRef.current(`${line}\n`);
      }
    };

    const onData = term.onData((data) => {
      if (!isTypistRef.current) return;

      if (data === "\x7f" || data === "\b") {
        if (lineBufferRef.current.length > 0) {
          lineBufferRef.current = lineBufferRef.current.slice(0, -1);
          term.write("\b \b");
          syncLinePreviewRef.current(lineBufferRef.current);
        }
        return;
      }

      if (data === "\x03") {
        lineBufferRef.current = "";
        term.write("^C\r\n");
        shellEndedWithNewlineRef.current = true;
        syncLinePreviewRef.current("");
        return;
      }

      if (data === "\r" || data === "\n") {
        const line = lineBufferRef.current;
        lineBufferRef.current = "";
        syncLinePreviewRef.current("");
        term.write("\r\n");
        shellEndedWithNewlineRef.current = true;
        void handleLine(line);
        return;
      }

      if (lineBufferRef.current.length === 0) {
        if (!shellEndedWithNewlineRef.current) {
          term.write("\r\n");
        }
        shellEndedWithNewlineRef.current = false;
        lineBufferRef.current = data;
        term.write(data);
        syncLinePreviewRef.current(lineBufferRef.current);
        return;
      }

      lineBufferRef.current += data;
      term.write(data);
      syncLinePreviewRef.current(lineBufferRef.current);
    });

    const ro = new ResizeObserver(() => {
      fitRef.current?.fit();
    });
    ro.observe(el);
    const onWinResize = (): void => {
      fitRef.current?.fit();
    };
    window.addEventListener("resize", onWinResize);

    return () => {
      window.removeEventListener("resize", onWinResize);
      ro.disconnect();
      onData.dispose();
      term.dispose();
      termInstanceRef.current = null;
      fitRef.current = null;
      lineBufferRef.current = "";
      previewStateRef.current.active = false;
      terminal.setTerminal(null);
    };
  }, [workspaceId, terminal.setTerminal, terminal.sandboxActive]);

  useEffect(() => {
    const term = termInstanceRef.current;
    if (!term) return;
    const canType = terminal.isTypist;
    term.options.disableStdin = !canType;
    if (canType) {
      focusTerminal(term);
    }
  }, [terminal.isTypist, terminal.wsConnected]);

  useEffect(() => {
    const term = termInstanceRef.current;
    if (!term) return;
    const jobId = operatorRunner.job?.id ?? null;
    if (jobId !== lastLogJobIdRef.current) {
      lastLogJobIdRef.current = jobId;
      lastPrintedLogSequenceRef.current = 0;
    }
    const logs = operatorRunner.liveLogs;
    let clearedTypingPreview = false;
    for (const entry of logs) {
      if (entry.sequence <= lastPrintedLogSequenceRef.current) continue;
      if (!clearedTypingPreview) {
        clearViewerTypingLineIfActive(term, previewStateRef);
        clearedTypingPreview = true;
      }
      lastPrintedLogSequenceRef.current = entry.sequence;
      const line = entry.chunk.replace(/\r?\n/g, " ");
      term.write(
        `\x1b[35m[pipeline]\x1b[0m \x1b[90m${entry.stream}\x1b[0m ${line}\r\n`,
      );
      shellEndedWithNewlineRef.current = true;
    }
  }, [operatorRunner.job?.id, operatorRunner.liveLogs]);

  if (terminal.statusLoading) {
    return (
      <div
        style={{
          padding: 16,
          color: "#aaa",
          fontSize: 13,
        }}
      >
        Se incarca starea terminalului...
      </div>
    );
  }

  if (!terminal.sandboxActive) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 12,
          padding: 16,
          maxWidth: 520,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "#e5e7eb" }}>
          Sandbox terminal nu este pornit
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>
          Comenzile operator și shell-ul partajat rulează în containerul Docker al workspace-ului.
          Porneste sandbox-ul pentru sesiunea partajată.
        </p>
        <button
          disabled={terminal.ensureLoading}
          onClick={() => {
            void terminal.startSandbox();
          }}
          style={{
            border: "1px solid #38bdf8",
            background: "#0c4a6e",
            color: "#e0f2fe",
            borderRadius: 8,
            padding: "8px 14px",
            cursor: terminal.ensureLoading ? "wait" : "pointer",
            fontSize: 13,
          }}
          type="button"
        >
          {terminal.ensureLoading ? "Se porneste..." : "Porneste sandbox terminal"}
        </button>
        {terminal.error ? (
          <div style={{ fontSize: 12, color: "#f87171" }}>{terminal.error}</div>
        ) : null}
      </div>
    );
  }

  const viewerMode =
    terminal.wsConnected &&
    !terminal.isTypist &&
    terminal.typistUserId != null &&
    terminal.typistUserId !== currentUserId;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        background: "#1e1e1e",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderBottom: "1px solid #333",
          fontSize: 12,
          color: "#cbd5e1",
        }}
      >
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            border: "1px solid #334155",
            background: "rgba(15,23,42,0.6)",
            fontSize: 11,
          }}
        >
          {terminal.isTypist
            ? `Control: tu (${currentUserName})`
            : terminal.typistName
              ? `Control: ${terminal.typistName}`
              : "Control: liber"}
        </span>
        <span>
          WS:{" "}
          <span style={{ color: terminal.wsConnected ? "#4ade80" : "#f87171" }}>
            {terminal.wsConnected ? "conectat" : "deconectat"}
          </span>
        </span>
        <span style={{ opacity: 0.85 }}>
          {terminal.isTypist ? (
            <>
              <strong style={{ color: "#7dd3fc" }}>
                {shellMode ? "Shell (sandbox)" : "Operator"}
              </strong>
              <span style={{ color: "#94a3b8" }}>
                {shellMode
                  ? " \u00b7 linii către container; exit = revenire"
                  : " \u00b7 tastatura activa (help / run / shell)"}
              </span>
            </>
          ) : viewerMode ? (
            <>
              <strong style={{ color: "#fcd34d" }}>Vizualizare</strong>
              <span style={{ color: "#94a3b8" }}>
                {" \u00b7 doar citire — aceeasi iesire live"}
              </span>
            </>
          ) : (
            <>
              Apasa{" "}
              <strong style={{ color: "#a5b4fc" }}>Preiau controlul</strong>
              {terminal.typistUserId == null ? (
                <span style={{ color: "#94a3b8" }}> (control liber)</span>
              ) : null}
            </>
          )}
        </span>
        <button
          disabled={!terminal.wsConnected || terminal.isTypist}
          onClick={() => {
            terminal.claimTypist();
            queueMicrotask(() => {
              focusTerminal(termInstanceRef.current);
            });
          }}
          style={{
            border: "1px solid #475569",
            background: "transparent",
            color: "#e2e8f0",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 12,
            cursor:
              terminal.wsConnected && !terminal.isTypist ? "pointer" : "not-allowed",
            opacity: terminal.wsConnected && !terminal.isTypist ? 1 : 0.5,
          }}
          type="button"
        >
          Preiau controlul
        </button>
        <button
          disabled={!terminal.wsConnected || !terminal.isTypist}
          onClick={() => terminal.releaseTypist()}
          style={{
            border: "1px solid #475569",
            background: "transparent",
            color: "#e2e8f0",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 12,
            cursor: terminal.wsConnected && terminal.isTypist ? "pointer" : "not-allowed",
            opacity: terminal.wsConnected && terminal.isTypist ? 1 : 0.5,
          }}
          type="button"
        >
          Eliberez
        </button>
        {viewerMode ? (
          <span style={{ fontSize: 11, color: "#94a3b8", flexBasis: "100%" }}>
            Nu poti tasta pana preiei controlul (sau cand e liber).
          </span>
        ) : null}
        {terminal.isTypist ? (
          <span style={{ fontSize: 11, color: "#64748b", flexBasis: "100%" }}>
            Click în terminal pentru focus. Spectatorii văd linia tastată live. Comenzi: help, run,
            shell, status, logs, clear, release.
          </span>
        ) : null}
      </div>
      {terminal.error ? (
        <div style={{ padding: "4px 10px", fontSize: 12, color: "#f87171" }}>
          {terminal.error}
        </div>
      ) : null}
      <div
        ref={containerRef}
        role="document"
        tabIndex={-1}
        onPointerDown={(e) => {
          if (!terminal.isTypist) return;
          if (e.button !== 0) return;
          focusTerminal(termInstanceRef.current);
        }}
        style={{
          flex: 1,
          minHeight: 0,
          padding: 8,
          overflow: "hidden",
          outline: "none",
          cursor: terminal.isTypist ? "text" : "default",
        }}
      />
    </div>
  );
}
