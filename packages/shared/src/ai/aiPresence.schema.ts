import { z } from "zod";

/** Identificator stabil pentru agentul AI în UI și pe canalul de prezență. */
export const AI_AGENT_ID = "itecify-ai" as const;

export const aiPresenceStatusSchema = z.enum([
  "standby",
  "thinking",
  "generating",
  "ready",
  "failed",
]);

export type AiPresenceStatus = z.infer<typeof aiPresenceStatusSchema>;

/**
 * Mesaj fan-out workspace-scoped peste WebSocket collab (`/ws-ai-presence`).
 * Nu se persistă în Postgres — doar stare efemeră în memorie pe server.
 */
export const aiPresenceUpdateSchema = z.object({
  type: z.literal("AI_PRESENCE_UPDATE"),
  workspaceId: z.string().min(1),
  agentId: z.string().min(1),
  displayName: z.string().min(1),
  presenceKind: z.literal("ai"),
  status: aiPresenceStatusSchema,
  filePath: z.string().nullable(),
  /** Utilizatorul care a inițiat cererea; poate fi gol când nu există cerere activă. */
  requestedByUserId: z.string(),
  timestamp: z.number(),
});

export type AiPresenceUpdate = z.infer<typeof aiPresenceUpdateSchema>;
