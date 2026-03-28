import type { PrismaClient } from "@prisma/client";
import { RunTemplate, WorkspaceMemberRole } from "@prisma/client";
import type { CreateWorkspaceBodyDto, JoinWorkspaceBodyDto } from "@itecify/shared/workspaces";
import { workspacePublicSchema, type WorkspacePublicDto } from "@itecify/shared/workspaces";
import { HttpError } from "../auth/errors.js";
import { buildTemplateInitialSnapshot } from "./initialSnapshot.js";
import { generateShareToken } from "./shareToken.js";

function toPublic(
  w: {
    id: string;
    name: string;
    template: RunTemplate;
    shareToken: string;
    ownerId: string;
    snapshotUpdatedAt: Date | null;
    createdAt: Date;
  },
  role: WorkspaceMemberRole,
): WorkspacePublicDto {
  return workspacePublicSchema.parse({
    id: w.id,
    name: w.name,
    template: w.template,
    shareToken: w.shareToken,
    ownerId: w.ownerId,
    role,
    snapshotUpdatedAt: w.snapshotUpdatedAt,
    createdAt: w.createdAt,
  });
}

export async function createWorkspace(
  prisma: PrismaClient,
  userId: string,
  body: CreateWorkspaceBodyDto,
): Promise<WorkspacePublicDto> {
  const initial = buildTemplateInitialSnapshot(body.template as RunTemplate);

  const ws = await prisma.$transaction(async (tx) => {
    const shareToken = generateShareToken();
    const created = await tx.workspace.create({
      data: {
        name: body.name,
        ownerId: userId,
        template: body.template as RunTemplate,
        shareToken,
        snapshot: initial as object,
        snapshotUpdatedAt: new Date(),
      },
    });

    await tx.workspaceMember.create({
      data: {
        workspaceId: created.id,
        userId,
        role: WorkspaceMemberRole.OWNER,
      },
    });

    return created;
  });

  return toPublic(ws, WorkspaceMemberRole.OWNER);
}

export async function listMyWorkspaces(
  prisma: PrismaClient,
  userId: string,
): Promise<WorkspacePublicDto[]> {
  const rows = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: true,
    },
    orderBy: { workspace: { updatedAt: "desc" } },
  });

  return rows.map((r) => toPublic(r.workspace, r.role));
}

export async function getWorkspaceForUser(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<WorkspacePublicDto> {
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId },
    },
    include: { workspace: true },
  });

  if (!membership) {
    throw new HttpError(403, "Nu ai acces la acest workspace.");
  }

  return toPublic(membership.workspace, membership.role);
}

export async function joinWorkspaceByToken(
  prisma: PrismaClient,
  userId: string,
  body: JoinWorkspaceBodyDto,
): Promise<WorkspacePublicDto> {
  const ws = await prisma.workspace.findUnique({
    where: { shareToken: body.shareToken },
  });

  if (!ws) {
    throw new HttpError(404, "Link invalid sau workspace inexistent.");
  }

  const existing = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId: ws.id, userId },
    },
  });

  if (existing) {
    return toPublic(ws, existing.role);
  }

  if (ws.ownerId === userId) {
    await prisma.workspaceMember.create({
      data: {
        workspaceId: ws.id,
        userId,
        role: WorkspaceMemberRole.OWNER,
      },
    });
    return toPublic(ws, WorkspaceMemberRole.OWNER);
  }

  await prisma.workspaceMember.create({
    data: {
      workspaceId: ws.id,
      userId,
      role: WorkspaceMemberRole.EDITOR,
    },
  });

  return toPublic(ws, WorkspaceMemberRole.EDITOR);
}

export async function assertWorkspaceMember(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<void> {
  const ok = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId },
    },
  });
  if (!ok) {
    throw new HttpError(403, "Nu ai acces la acest workspace.");
  }
}
