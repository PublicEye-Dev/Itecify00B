import * as monaco from "monaco-editor";
import {
  type CursorLeaveMessage,
  type CursorMoveMessage,
  isCursorLeaveMessage,
  isCursorMoveMessage,
} from "./cursorMessages.js";

const THROTTLE_MS = 72;
const STYLE_ID = "itecify-json-remote-head-colors";

function collabWsBase(): string {
  const u = import.meta.env.VITE_COLLAB_WS_URL;
  if (typeof u === "string" && u.length > 0) return u.replace(/\/$/, "");
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.hostname}:1234`;
}

function cursorChannelUrl(workspaceId: string): string {
  return `${collabWsBase()}/ws-cursor?workspaceId=${encodeURIComponent(workspaceId)}`;
}

function safeCssToken(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function pickContrastText(bgHex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(bgHex.trim());
  if (!m) return "#0d1117";
  const r = parseInt(m[1]!, 16);
  const g = parseInt(m[2]!, 16);
  const b = parseInt(m[3]!, 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? "#0d1117" : "#f8fafc";
}

function flushHeadColorRules(
  colorByToken: Map<string, string>,
): void {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  const lines: string[] = [];
  colorByToken.forEach((color, token) => {
    lines.push(`
      .monaco-editor .itecify-rch-${token} {
        border-left: 2px solid ${color} !important;
        height: 100%;
        box-sizing: border-box;
      }
    `);
  });
  el.textContent = lines.join("\n");
}

function clearHeadStyles(): void {
  const el = document.getElementById(STYLE_ID);
  if (el) el.textContent = "";
}

type RemoteEntry = {
  decorationIds: string[];
  widget: monaco.editor.IContentWidget | null;
};

/**
 * Cursori remote JSON peste /ws-cursor; nu interferează cu Yjs text sync.
 */
export function bindRemoteCursorChannel(params: {
  workspaceId: string;
  filePath: string;
  localUserId: string;
  displayName: string;
  color: string;
  editor: monaco.editor.IStandaloneCodeEditor;
  model: monaco.editor.ITextModel;
}): () => void {
  const { editor, model, workspaceId, filePath, localUserId, displayName, color } =
    params;

  const remotes = new Map<string, RemoteEntry>();
  const headColors = new Map<string, string>();

  const ws = new WebSocket(cursorChannelUrl(workspaceId));

  let throttleTimer: ReturnType<typeof setTimeout> | null = null;
  let throttlePending = false;
  let lastFire = 0;

  const sendMoveNow = (): void => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const sel = editor.getSelection();
    if (!sel || editor.getModel() !== model) return;

    const a = model.getOffsetAt(sel.getStartPosition());
    const b = model.getOffsetAt(sel.getEndPosition());
    const headPos = sel.getPosition();
    const head = model.getOffsetAt(headPos);

    const msg: CursorMoveMessage = {
      type: "CURSOR_MOVE",
      workspaceId,
      userId: localUserId,
      displayName,
      color,
      filePath,
      cursor: {
        index: head,
        line: headPos.lineNumber,
        column: headPos.column,
      },
      selection: { start: Math.min(a, b), end: Math.max(a, b) },
      timestamp: Date.now(),
    };
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* nu blocăm tastarea */
    }
  };

  const scheduleSend = (): void => {
    const now = Date.now();
    if (now - lastFire >= THROTTLE_MS) {
      lastFire = now;
      sendMoveNow();
      throttlePending = false;
      return;
    }
    if (throttleTimer != null || throttlePending) {
      throttlePending = true;
      return;
    }
    throttleTimer = setTimeout(() => {
      throttleTimer = null;
      lastFire = Date.now();
      sendMoveNow();
      if (throttlePending) {
        throttlePending = false;
        scheduleSend();
      }
    }, THROTTLE_MS - (now - lastFire));
  };

  const sub = editor.onDidChangeCursorSelection(() => {
    scheduleSend();
  });

  const removeRemoteUi = (userId: string): void => {
    const ex = remotes.get(userId);
    if (!ex) return;
    if (ex.widget) editor.removeContentWidget(ex.widget);
    model.deltaDecorations(ex.decorationIds, []);
    remotes.delete(userId);
    const tok = safeCssToken(userId);
    headColors.delete(tok);
    flushHeadColorRules(headColors);
  };

  const applyMove = (msg: CursorMoveMessage): void => {
    if (msg.userId === localUserId) return;
    if (msg.workspaceId !== workspaceId) return;
    if (msg.filePath !== filePath) return;

    const maxI = model.getValueLength();
    if (msg.cursor.index < 0 || msg.cursor.index > maxI) return;

    let s = Math.max(0, Math.min(msg.selection.start, maxI));
    let e = Math.max(0, Math.min(msg.selection.end, maxI));
    if (s > e) [s, e] = [e, s];

    removeRemoteUi(msg.userId);

    const safeTok = safeCssToken(msg.userId);
    headColors.set(safeTok, msg.color);
    flushHeadColorRules(headColors);

    const decos: monaco.editor.IModelDeltaDecoration[] = [];
    if (s !== e) {
      const p1 = model.getPositionAt(s);
      const p2 = model.getPositionAt(e);
      decos.push({
        range: monaco.Range.fromPositions(p1, p2),
        options: {
          className: "itecify-json-remote-sel",
          isWholeLine: false,
        },
      });
    }

    const head = model.getPositionAt(msg.cursor.index);
    decos.push({
      range: new monaco.Range(
        head.lineNumber,
        head.column,
        head.lineNumber,
        head.column,
      ),
      options: {
        beforeContentClassName: `itecify-json-remote-head itecify-rch-${safeTok}`,
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    });

    const decorationIds = model.deltaDecorations([], decos);

    const dom = document.createElement("div");
    dom.textContent = msg.displayName;
    dom.style.cssText = [
      "font-size:11px",
      "line-height:1.2",
      "padding:2px 6px",
      "border-radius:4px",
      `background:${msg.color}`,
      `color:${pickContrastText(msg.color)}`,
      "font-weight:600",
      "pointer-events:none",
      "white-space:nowrap",
      "box-shadow:0 1px 3px rgba(0,0,0,0.35)",
      "border:1px solid rgba(255,255,255,0.15)",
    ].join(";");

    const widget: monaco.editor.IContentWidget = {
      getId: () => `itecify-json-cursor-${msg.userId}`,
      getDomNode: () => dom,
      getPosition: () => ({
        position: head,
        preference: [monaco.editor.ContentWidgetPositionPreference.ABOVE],
      }),
      allowEditorOverflow: true,
    };
    editor.addContentWidget(widget);
    remotes.set(msg.userId, { decorationIds, widget });
  };

  ws.onmessage = (ev) => {
    let data: unknown;
    try {
      data = JSON.parse(String(ev.data));
    } catch {
      if (import.meta.env.DEV) console.debug("[itecify][cursor] drop non-json");
      return;
    }

    if (isCursorMoveMessage(data)) {
      applyMove(data);
      return;
    }
    if (isCursorLeaveMessage(data)) {
      const m = data as CursorLeaveMessage;
      if (m.workspaceId !== workspaceId) return;
      if (m.userId === localUserId) return;
      removeRemoteUi(m.userId);
    }
  };

  ws.onopen = () => {
    sendMoveNow();
  };

  return () => {
    sub.dispose();
    if (throttleTimer != null) clearTimeout(throttleTimer);
    for (const uid of [...remotes.keys()]) removeRemoteUi(uid);
    clearHeadStyles();

    const leave: CursorLeaveMessage = {
      type: "CURSOR_LEAVE",
      workspaceId,
      userId: localUserId,
      timestamp: Date.now(),
    };
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(leave));
    } catch {
      /* ignore */
    }
    ws.close();
  };
}
