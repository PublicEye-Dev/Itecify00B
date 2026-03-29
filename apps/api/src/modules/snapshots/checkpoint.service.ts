import type {
  PrismaClient,
  SnapshotCheckpointKind as PrismaCheckpointKind,
} from "@prisma/client";
import {
  checkpointListResponseSchema,
  recordCheckpointBodySchema,
  restoreCheckpointResponseSchema,
  type RecordCheckpointBodyDto,
} from "@itecify/shared/replay";
import {
  isWorkspaceSnapshotV1,
  type WorkspaceSnapshotV1,
} from "@itecify/shared/collab";
import { HttpError } from "../auth/errors.js";
import { assertWorkspaceMember } from "../workspaces/workspace.service.js";
import { saveSnapshot } from "./snapshot.service.js";

const MAX_CHECKPOINTS_PER_WORKSPACE = 150;
/** Nu înregistra AUTOSAVE mai des (reduce zgomot în timeline). */
const AUTOSAVE_MIN_INTERVAL_MS = 45_000;

async function pruneOldCheckpoints(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<void> {
  const count = await prisma.workspaceSnapshotCheckpoint.count({
    where: { workspaceId },
  });
  if (count <= MAX_CHECKPOINTS_PER_WORKSPACE) return;
  const excess = count - MAX_CHECKPOINTS_PER_WORKSPACE;
  const oldest = await prisma.workspaceSnapshotCheckpoint.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    take: excess,
    select: { id: true },
  });
  if (oldest.length === 0) return;
  await prisma.workspaceSnapshotCheckpoint.deleteMany({
    where: { id: { in: oldest.map((r) => r.id) } },
  });
}

export async function recordCheckpoint(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  body: unknown,
): Promise<{ ok: true; recorded: boolean; id?: string }> {
  let parsed: RecordCheckpointBodyDto;
  try {
    parsed = recordCheckpointBodySchema.parse(body);
  } catch {
    throw new HttpError(400, "Corp checkpoint invalid.");
  }

  await assertWorkspaceMember(prisma, userId, workspaceId);

  if (parsed.kind === "AUTOSAVE") {
    const recent = await prisma.workspaceSnapshotCheckpoint.findFirst({
      where: { workspaceId, kind: "AUTOSAVE" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (
      recent &&
      Date.now() - recent.createdAt.getTime() < AUTOSAVE_MIN_INTERVAL_MS
    ) {
      return { ok: true, recorded: false };
    }
  }

  const row = await prisma.workspaceSnapshotCheckpoint.create({
    data: {
      workspaceId,
      kind: parsed.kind as PrismaCheckpointKind,
      snapshot: parsed.snapshot as object,
    },
    select: { id: true },
  });

  await pruneOldCheckpoints(prisma, workspaceId);

  return { ok: true, recorded: true, id: row.id };
}

export async function listCheckpoints(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
) {
  await assertWorkspaceMember(prisma, userId, workspaceId);

  const rows = await prisma.workspaceSnapshotCheckpoint.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      kind: true,
      createdAt: true,
    },
  });

  return checkpointListResponseSchema.parse({
    checkpoints: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      createdAt: r.createdAt,
    })),
  });
}

export async function getCheckpointSnapshot(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  checkpointId: string,
): Promise<WorkspaceSnapshotV1> {
  await assertWorkspaceMember(prisma, userId, workspaceId);

  const row = await prisma.workspaceSnapshotCheckpoint.findFirst({
    where: { id: checkpointId, workspaceId },
    select: { snapshot: true },
  });

  if (!row) {
    throw new HttpError(404, "Checkpoint inexistent.");
  }

  const raw = row.snapshot as unknown;
  if (!isWorkspaceSnapshotV1(raw)) {
    throw new HttpError(500, "Snapshot checkpoint corupt.");
  }
  return raw;
}

/**
 * Resetează room-ul Yjs în memorie pe serverul collab. Fără asta, clienții reconectați îmbină
 * starea veche din room cu snapshot-ul nou din DB.
 */
async function notifyCollabRoomRestore(
  workspaceId: string,
  update: Uint8Array,
): Promise<void> {
  const base = process.env.COLLAB_HTTP_URL?.trim();
  const secret = process.env.COLLAB_ROOM_RESTORE_SECRET?.trim();

  if (!base || !secret) {
    throw new HttpError(
      503,
      "Restore incomplet: în .env (rădăcină, pentru API) setează COLLAB_HTTP_URL (ex. http://127.0.0.1:1234) și COLLAB_ROOM_RESTORE_SECRET — identic cu apps/collab.",
    );
  }

  const url = `${base.replace(/\/$/, "")}/room/restore`;
  let res: Response;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15_000);
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Room-Restore-Secret": secret,
      },
      body: JSON.stringify({
        workspaceId,
        update: Array.from(update),
      }),
      signal: ac.signal,
    });
    clearTimeout(t);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new HttpError(
      502,
      `Nu am putut contacta collab la restore (COLLAB_HTTP_URL=${base}): ${msg}`,
    );
  }

  if (!res.ok) {
    const text = (await res.text()).trim().slice(0, 300);
    throw new HttpError(
      502,
      `Collab a refuzat resetarea room-ului Yjs (HTTP ${res.status}). ${text || "Fără corp răspuns."}`,
    );
  }
}

/**
 * Înlocuiește snapshot-ul canonic, apoi resetează room-ul collab. Dacă collab eșuează după
 * save DB, clientul poate reîncerca restore cu același checkpoint (idempotent pe room).
 */
export async function restoreCheckpoint(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  checkpointId: string,
) {
  const snap = await getCheckpointSnapshot(
    prisma,
    userId,
    workspaceId,
    checkpointId,
  );

  await saveSnapshot(prisma, userId, workspaceId, snap);

  const bytes = new Uint8Array(snap.update);
  await notifyCollabRoomRestore(workspaceId, bytes);

  return restoreCheckpointResponseSchema.parse({
    ok: true,
    liveStateAligned: true,
  });
}
