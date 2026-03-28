/**
 * Fan-out JSON pentru cursori remote (Prompt 5). Separat de protocolul binary Yjs.
 */
import type { WebSocket } from "ws";

export type CursorMovePayload = {
  type: "CURSOR_MOVE";
  workspaceId: string;
  userId: string;
  displayName: string;
  color: string;
  filePath: string;
  cursor: { index: number; line: number; column: number };
  selection: { start: number; end: number };
  timestamp: number;
};

export type CursorLeavePayload = {
  type: "CURSOR_LEAVE";
  workspaceId: string;
  userId: string;
  timestamp: number;
};

type SocketMeta = { workspaceId: string; userId: string | null };

const rooms = new Map<string, Set<WebSocket>>();
const socketMeta = new WeakMap<WebSocket, SocketMeta>();

function roomAdd(workspaceId: string, ws: WebSocket): void {
  let s = rooms.get(workspaceId);
  if (!s) {
    s = new Set();
    rooms.set(workspaceId, s);
  }
  s.add(ws);
}

function roomRemove(workspaceId: string, ws: WebSocket): void {
  const s = rooms.get(workspaceId);
  if (!s) return;
  s.delete(ws);
  if (s.size === 0) rooms.delete(workspaceId);
}

function broadcastRaw(workspaceId: string, except: WebSocket, raw: string): void {
  const s = rooms.get(workspaceId);
  if (!s) return;
  for (const client of s) {
    if (client !== except && client.readyState === 1) client.send(raw);
  }
}

function parseCursorMove(raw: unknown, expectedWorkspaceId: string): CursorMovePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.type !== "CURSOR_MOVE") return null;
  if (typeof o.workspaceId !== "string" || o.workspaceId !== expectedWorkspaceId)
    return null;
  if (typeof o.userId !== "string" || !o.userId) return null;
  if (typeof o.displayName !== "string") return null;
  if (typeof o.color !== "string" || o.color.length < 4) return null;
  if (typeof o.filePath !== "string") return null;

  const cur = o.cursor;
  if (!cur || typeof cur !== "object") return null;
  const c = cur as Record<string, unknown>;
  if (typeof c.index !== "number" || !Number.isFinite(c.index)) return null;
  if (typeof c.line !== "number" || typeof c.column !== "number") return null;

  const sel = o.selection;
  if (!sel || typeof sel !== "object") return null;
  const s = sel as Record<string, unknown>;
  if (typeof s.start !== "number" || typeof s.end !== "number") return null;

  const ts = typeof o.timestamp === "number" ? o.timestamp : Date.now();

  return {
    type: "CURSOR_MOVE",
    workspaceId: o.workspaceId,
    userId: o.userId,
    displayName: o.displayName,
    color: o.color,
    filePath: o.filePath,
    cursor: { index: c.index, line: c.line, column: c.column },
    selection: { start: s.start, end: s.end },
    timestamp: ts,
  };
}

function parseLeave(
  raw: unknown,
  expectedWorkspaceId: string,
): CursorLeavePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.type !== "CURSOR_LEAVE") return null;
  if (typeof o.workspaceId !== "string" || o.workspaceId !== expectedWorkspaceId)
    return null;
  if (typeof o.userId !== "string" || !o.userId) return null;
  return {
    type: "CURSOR_LEAVE",
    workspaceId: o.workspaceId,
    userId: o.userId,
    timestamp: typeof o.timestamp === "number" ? o.timestamp : Date.now(),
  };
}

export function attachCursorSocket(ws: WebSocket, workspaceId: string): void {
  roomAdd(workspaceId, ws);
  socketMeta.set(ws, { workspaceId, userId: null });

  ws.on("message", (data) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof data === "string" ? data : data.toString());
    } catch {
      return;
    }

    const move = parseCursorMove(parsed, workspaceId);
    if (move) {
      socketMeta.set(ws, { workspaceId, userId: move.userId });
      broadcastRaw(workspaceId, ws, JSON.stringify(move));
      return;
    }

    const leave = parseLeave(parsed, workspaceId);
    if (leave) {
      socketMeta.set(ws, { workspaceId, userId: leave.userId });
      broadcastRaw(workspaceId, ws, JSON.stringify(leave));
    }
  });

  ws.on("close", () => {
    const meta = socketMeta.get(ws);
    socketMeta.delete(ws);
    if (!meta) return;
    roomRemove(meta.workspaceId, ws);
    if (meta.userId) {
      const leave: CursorLeavePayload = {
        type: "CURSOR_LEAVE",
        workspaceId: meta.workspaceId,
        userId: meta.userId,
        timestamp: Date.now(),
      };
      broadcastRaw(meta.workspaceId, ws, JSON.stringify(leave));
    }
  });
}
