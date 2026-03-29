import { useCallback, useEffect, useRef, useState } from "react";
import { terminalServerControlSchema } from "@itecify/shared/terminal";
import type { Terminal } from "xterm";
import {
  ensureTerminalSandbox,
  getTerminalSandboxStatus,
  terminalStreamWsUrl,
} from "../../lib/api/terminalApi.js";

const WS_OPEN = WebSocket.OPEN;
const devLog = (...args: unknown[]): void => {
  if (import.meta.env.DEV) {
    console.debug("[terminal]", ...args);
  }
};

/** \n fără \r poate deplasa cursorul în xterm pe Windows / conexiuni mixte. Nu adăugăm \r\n la sfârșitul bucății (ar rupe fluxul multi-chunk). */
function convertLfToCrlfInChunk(text: string): string {
  return text.replace(/(?<!\r)\n/g, "\r\n");
}

function escapeForCommandEchoDisplay(s: string): string {
  return s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

export type TerminalLinePreviewServerMessage = {
  type: "line_preview";
  holderUserId: string;
  holderName: string | null;
  text: string;
};

export function useWorkspaceTerminal(opts: {
  workspaceId: string;
  currentUserId: string;
  /** Când true, menținem WebSocket deschis (ex. tab-ul terminal e vizibil). */
  wsEnabled: boolean;
  onBeforeEnsureSandbox: () => Promise<void>;
  /** Spectatori: linie tastată live de operator (nu se apelează pentru propriul holderUserId). */
  onLinePreview?: (msg: TerminalLinePreviewServerMessage) => void;
  /** Înainte de stdout/stderr din shell — resetează starea liniei „[typing]” la spectatori. */
  onShellOutput?: () => void;
  /**
   * Doar pentru operator: textul UTF-8 scris din fluxul binar (shell + operator_broadcast),
   * înainte de write — folosit ca să știm dacă ultimul caracter e newline (pentru cursor la următoarea tastare).
   */
  onTypistShellBinary?: (decodedUtf8: string) => void;
}) {
  const [sandboxActive, setSandboxActive] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [ensureLoading, setEnsureLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [typistUserId, setTypistUserId] = useState<string | null>(null);
  const [typistName, setTypistName] = useState<string | null>(null);

  /** Aliniat cu state; folosit în sendTerminalInput ca să nu depindă de closure învechit după claim. */
  const typistUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    typistUserIdRef.current = typistUserId;
  }, [typistUserId]);

  const wsRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const textDecoderRef = useRef(new TextDecoder());
  const onLinePreviewRef = useRef(opts.onLinePreview);
  const onShellOutputRef = useRef(opts.onShellOutput);
  const onTypistShellBinaryRef = useRef(opts.onTypistShellBinary);
  onLinePreviewRef.current = opts.onLinePreview;
  onShellOutputRef.current = opts.onShellOutput;
  onTypistShellBinaryRef.current = opts.onTypistShellBinary;

  const setTerminal = useCallback((term: Terminal | null) => {
    terminalRef.current = term;
  }, []);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    setError(null);
    try {
      const s = await getTerminalSandboxStatus(opts.workspaceId);
      setSandboxActive(s.active);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare status terminal.");
      setSandboxActive(false);
    } finally {
      setStatusLoading(false);
    }
  }, [opts.workspaceId]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const startSandbox = useCallback(async () => {
    setEnsureLoading(true);
    setError(null);
    try {
      await opts.onBeforeEnsureSandbox();
      await ensureTerminalSandbox(opts.workspaceId);
      await refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nu s-a putut porni sandbox-ul.");
    } finally {
      setEnsureLoading(false);
    }
  }, [opts.onBeforeEnsureSandbox, opts.workspaceId, refreshStatus]);

  const claimTypist = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WS_OPEN) return;
    devLog("claim_typist click");
    ws.send(JSON.stringify({ type: "claim_typist" }));
  }, []);

  const releaseTypist = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WS_OPEN) return;
    devLog("release_typist");
    ws.send(JSON.stringify({ type: "release_typist" }));
  }, []);

  /** Octeți către shell-ul din sandbox (fără echo — linia e gestionată în panou). */
  const sendShellStdin = useCallback(
    (data: string) => {
      const holder = typistUserIdRef.current;
      if (holder !== opts.currentUserId) {
        devLog("sendShellStdin ignored (not typist)", { holder, me: opts.currentUserId });
        return;
      }
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WS_OPEN) return;
      const bytes = new TextEncoder().encode(data);
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      ws.send(ab);
      devLog("sendShellStdin bytes", ab.byteLength);
    },
    [opts.currentUserId],
  );

  /** Mesaj vizibil pentru toți clienții (doar typist). */
  const broadcastOperatorText = useCallback(
    (text: string) => {
      const holder = typistUserIdRef.current;
      if (holder !== opts.currentUserId) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WS_OPEN) return;
      ws.send(JSON.stringify({ type: "operator_broadcast", text }));
    },
    [opts.currentUserId],
  );

  /** Linie curentă tastată — difuzată la spectatori (nu repeta echo local). */
  const syncLinePreview = useCallback(
    (text: string) => {
      const holder = typistUserIdRef.current;
      if (holder !== opts.currentUserId) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WS_OPEN) return;
      ws.send(JSON.stringify({ type: "line_preview", text }));
    },
    [opts.currentUserId],
  );

  /** Linie fixă în istoric pentru spectatori; operatorul ignoră (îl vede deja local). */
  const sendCommandEcho = useCallback(
    (line: string) => {
      const holder = typistUserIdRef.current;
      if (holder !== opts.currentUserId) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WS_OPEN) return;
      ws.send(JSON.stringify({ type: "command_echo", line }));
    },
    [opts.currentUserId],
  );

  useEffect(() => {
    if (!opts.wsEnabled || !sandboxActive) {
      wsRef.current?.close();
      wsRef.current = null;
      setWsConnected(false);
      return;
    }

    const url = terminalStreamWsUrl(opts.workspaceId);
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      devLog("ws open", url);
    };

    ws.onmessage = (ev: MessageEvent<string | ArrayBuffer | Blob>) => {
      const term = terminalRef.current;
      if (typeof ev.data === "string") {
        let parsed: unknown;
        try {
          parsed = JSON.parse(ev.data) as unknown;
        } catch {
          return;
        }
        const ctrl = terminalServerControlSchema.safeParse(parsed);
        if (!ctrl.success) return;
        const msg = ctrl.data;

        if (msg.type === "typist") {
          setTypistUserId(msg.holderUserId);
          setTypistName(msg.holderName);
          devLog("typist broadcast", msg.holderUserId, msg.holderName);
          return;
        }

        if (msg.type === "claim_result") {
          devLog("claim_result", msg.ok, msg.reason);
          if (msg.ok) {
            setError(null);
          } else if (msg.reason) {
            setError(msg.reason);
          }
          return;
        }

        if (msg.type === "line_preview") {
          if (msg.holderUserId === opts.currentUserId) {
            return;
          }
          onLinePreviewRef.current?.(msg);
          return;
        }

        if (msg.type === "command_echo") {
          if (msg.holderUserId === opts.currentUserId) {
            return;
          }
          const safe = escapeForCommandEchoDisplay(msg.line);
          term?.write(`\r\n\x1b[37m${safe}\x1b[0m\r\n`);
          return;
        }

        if (msg.type === "status" && msg.kind === "shell_error") {
          term?.write(
            `\r\n\x1b[33m[terminal]\x1b[0m ${msg.message ?? "Eroare shell."}\r\n`,
          );
          return;
        }
        return;
      }

      if (ev.data instanceof ArrayBuffer && term) {
        const isViewer = typistUserIdRef.current !== opts.currentUserId;
        if (isViewer) {
          onShellOutputRef.current?.();
        }
        const decoded = textDecoderRef.current.decode(ev.data);
        if (!isViewer) {
          onTypistShellBinaryRef.current?.(decoded);
        }
        term.write(convertLfToCrlfInChunk(decoded));
        return;
      }

      if (ev.data instanceof Blob) {
        void ev.data.arrayBuffer().then((buf) => {
          const t = terminalRef.current;
          if (!t) return;
          const isViewer = typistUserIdRef.current !== opts.currentUserId;
          if (isViewer) {
            onShellOutputRef.current?.();
          }
          const decoded = textDecoderRef.current.decode(buf);
          if (!isViewer) {
            onTypistShellBinaryRef.current?.(decoded);
          }
          t.write(convertLfToCrlfInChunk(decoded));
        });
      }
    };

    ws.onerror = () => {
      setError("Conexiune WebSocket terminal eșuată.");
      devLog("ws error");
    };

    ws.onclose = () => {
      setWsConnected(false);
      wsRef.current = null;
      devLog("ws close");
    };

    return () => {
      ws.close();
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }, [opts.wsEnabled, sandboxActive, opts.workspaceId, opts.currentUserId]);

  const isTypist = typistUserId === opts.currentUserId;

  return {
    sandboxActive,
    statusLoading,
    ensureLoading,
    error,
    wsConnected,
    typistUserId,
    typistName,
    isTypist,
    refreshStatus,
    startSandbox,
    claimTypist,
    releaseTypist,
    sendShellStdin,
    broadcastOperatorText,
    syncLinePreview,
    sendCommandEcho,
    setTerminal,
  };
}
