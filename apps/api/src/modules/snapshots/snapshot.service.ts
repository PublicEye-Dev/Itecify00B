import type { PrismaClient } from "@prisma/client";
import {
  isWorkspaceSnapshotV1,
  type WorkspaceSnapshotV1,
} from "@itecify/shared/collab";
import { HttpError } from "../auth/errors.js";
import { assertWorkspaceMember } from "../workspaces/workspace.service.js";

export async function loadLatestSnapshot(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceSnapshotV1> {
  await assertWorkspaceMember(prisma, userId, workspaceId);

  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { snapshot: true },
  });

  if (!ws?.snapshot) {
    return { version: 1, update: [] };
  }

  const raw = ws.snapshot as unknown;
  if (!isWorkspaceSnapshotV1(raw)) {
    return { version: 1, update: [] };
  }
  return raw;
}

export async function saveSnapshot(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  body: unknown,
): Promise<void> {
  await assertWorkspaceMember(prisma, userId, workspaceId);

  if (!isWorkspaceSnapshotV1(body)) {
    throw new HttpError(400, "Invalid workspace snapshot payload.");
  }

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      snapshot: body as object,
      snapshotUpdatedAt: new Date(),
    },
  });
}

/** Pentru runner Docker: bytes Yjs din DB. */
export async function getSnapshotBytesForWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<Uint8Array | undefined> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { snapshot: true },
  });
  if (!ws?.snapshot) return undefined;
  const raw = ws.snapshot as unknown;
  if (!isWorkspaceSnapshotV1(raw) || raw.update.length === 0) return undefined;
  return new Uint8Array(raw.update);
}
