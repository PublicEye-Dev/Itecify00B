import "./env.js";
import process from "node:process";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import {
  createHealthPayload,
  isWorkspaceSnapshotV1,
  type WorkspaceSnapshotV1,
} from "@itecify/shared";
import { getSnapshot, setSnapshot } from "./snapshotStore.js";

/** Pino (logger: true) bufferizează des stdout când pnpm rulează cu --stream (fără TTY) → zero linii vizibile pe Windows. */
const app = Fastify({
  logger: process.env.NODE_ENV === "production",
});

const prisma = new PrismaClient();

await app.register(cors, {
  origin: true,
});

app.get("/health", async () => createHealthPayload("api"));

/**
 * Seed la cold start: clientul aplică `update` cu Y.applyUpdate înainte de WebSocket.
 * Fără snapshot stocat returnăm `update: []` (200), nu 404 — astfel browserul primește
 * mereu headere CORS pe ruta reală (uneori 404 fără CORS clar confundă debugging-ul).
 */
app.get<{ Params: { workspaceId: string } }>(
  "/workspaces/:workspaceId/snapshot",
  async (request, reply) => {
    const { workspaceId } = request.params;
    const bytes = getSnapshot(workspaceId);
    const body: WorkspaceSnapshotV1 = {
      version: 1,
      update: bytes ? Array.from(bytes) : [],
    };
    return reply.send(body);
  },
);

app.put<{ Params: { workspaceId: string }; Body: unknown }>(
  "/workspaces/:workspaceId/snapshot",
  async (request, reply) => {
    const { workspaceId } = request.params;
    if (!isWorkspaceSnapshotV1(request.body)) {
      return reply.code(400).send({ message: "invalid body" });
    }
    setSnapshot(workspaceId, new Uint8Array(request.body.update));
    return reply.send({ ok: true });
  },
);

app.addHook("onClose", async () => {
  await prisma.$disconnect();
});

const port = Number(process.env.API_PORT ?? "3001");
const host = process.env.API_HOST ?? "0.0.0.0";

console.log(`[api] Starting (port ${port})…`);

try {
  await app.listen({ port, host });
  const shown = host === "0.0.0.0" ? "127.0.0.1" : host;
  console.log(`[api] Ready — http://${shown}:${port}  (GET /health)`);
} catch (err) {
  console.error("[api] Failed to listen (port în uz sau altă eroare):", err);
  await prisma.$disconnect();
  process.exit(1);
}
