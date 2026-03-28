/**
 * Fan-out JSON pentru prezența AI (Prompt 6). Separat de Yjs și de canalul cursorilor.
 */
import type { WebSocket } from "ws";
import {
  AI_AGENT_ID,
  aiPresenceUpdateSchema,
  type AiPresenceUpdate,
} from "@itecify/shared/ai";

const rooms = new Map<string, Set<WebSocket>>();
const lastByWorkspace = new Map<string, AiPresenceUpdate>();
/** Socket care a emis ultima stare „activă” (thinking/generating) — pentru curățare la disconnect. */
const requesterByWorkspace = new Map<string, WebSocket>();

function defaultStandby(workspaceId: string): AiPresenceUpdate {
  return {
    type: "AI_PRESENCE_UPDATE",
    workspaceId,
    agentId: AI_AGENT_ID,
    displayName: "AI",
    presenceKind: "ai",
    status: "standby",
    filePath: null,
    requestedByUserId: "",
    timestamp: Date.now(),
  };
}

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

function broadcastAll(workspaceId: string, raw: string): void {
  const s = rooms.get(workspaceId);
  if (!s) return;
  for (const client of s) {
    if (client.readyState === 1) client.send(raw);
  }
}

export function attachAiPresenceSocket(ws: WebSocket, workspaceId: string): void {
  roomAdd(workspaceId, ws);

  const initial = lastByWorkspace.get(workspaceId) ?? defaultStandby(workspaceId);
  lastByWorkspace.set(workspaceId, initial);
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(initial));
  }

  ws.on("message", (data) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof data === "string" ? data : data.toString());
    } catch {
      return;
    }

    const validated = aiPresenceUpdateSchema.safeParse(parsed);
    if (!validated.success) return;
    const msg = validated.data;
    if (msg.workspaceId !== workspaceId) return;

    lastByWorkspace.set(workspaceId, msg);

    const st = msg.status;
    if (st === "thinking" || st === "generating") {
      requesterByWorkspace.set(workspaceId, ws);
    } else if (st === "standby") {
      const cur = requesterByWorkspace.get(workspaceId);
      if (cur === ws) requesterByWorkspace.delete(workspaceId);
    }

    broadcastAll(workspaceId, JSON.stringify(msg));
  });

  ws.on("close", () => {
    roomRemove(workspaceId, ws);
    const req = requesterByWorkspace.get(workspaceId);
    if (req === ws) {
      requesterByWorkspace.delete(workspaceId);
      const standby = defaultStandby(workspaceId);
      lastByWorkspace.set(workspaceId, standby);
      broadcastAll(workspaceId, JSON.stringify(standby));
    }
  });
}
