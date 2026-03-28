import { useCallback, useEffect, useRef, useState } from "react";
import {
  AI_AGENT_ID,
  aiPresenceUpdateSchema,
  type AiPresenceUpdate,
} from "@itecify/shared/ai";

function collabWsBase(): string {
  const u = import.meta.env.VITE_COLLAB_WS_URL;
  if (typeof u === "string" && u.length > 0) return u.replace(/\/$/, "");
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.hostname}:1234`;
}

function aiPresenceUrl(workspaceId: string): string {
  return `${collabWsBase()}/ws-ai-presence?workspaceId=${encodeURIComponent(workspaceId)}`;
}

export type SendAiPresenceInput = Pick<
  AiPresenceUpdate,
  "status" | "filePath" | "requestedByUserId"
>;

/**
 * Conexiune WebSocket la collab pentru stare efemeră AI (același cookie de sesiune ca Yjs).
 */
export function useWorkspaceAiPresence(workspaceId: string): {
  presence: AiPresenceUpdate | null;
  send: (input: SendAiPresenceInput) => void;
  wsConnected: boolean;
} {
  const [presence, setPresence] = useState<AiPresenceUpdate | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(aiPresenceUrl(workspaceId));
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onclose = () => {
      setWsConnected(false);
      wsRef.current = null;
    };

    ws.onmessage = (ev) => {
      let raw: unknown;
      try {
        raw = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data));
      } catch {
        return;
      }
      const parsed = aiPresenceUpdateSchema.safeParse(raw);
      if (!parsed.success) return;
      setPresence(parsed.data);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [workspaceId]);

  const send = useCallback(
    (input: SendAiPresenceInput): void => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const msg: AiPresenceUpdate = {
        type: "AI_PRESENCE_UPDATE",
        workspaceId,
        agentId: AI_AGENT_ID,
        displayName: "AI",
        presenceKind: "ai",
        status: input.status,
        filePath: input.filePath,
        requestedByUserId: input.requestedByUserId,
        timestamp: Date.now(),
      };

      try {
        ws.send(JSON.stringify(msg));
      } catch {
        /* prezența e best-effort */
      }
    },
    [workspaceId],
  );

  return { presence, send, wsConnected };
}
