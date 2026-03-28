import {
  createWorkspaceBodySchema,
  createWorkspaceResponseSchema,
  joinWorkspaceBodySchema,
  joinWorkspaceResponseSchema,
  workspaceDetailResponseSchema,
  workspaceListResponseSchema,
} from "@itecify/shared/workspaces";
import type { FastifyInstance } from "fastify";
import {
  loadLatestSnapshot,
  saveSnapshot,
} from "../snapshots/snapshot.service.js";
import {
  createWorkspace,
  getWorkspaceForUser,
  joinWorkspaceByToken,
  listMyWorkspaces,
} from "./workspace.service.js";

export async function registerWorkspaceRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post<{ Body: unknown }>(
    "/workspaces",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = createWorkspaceBodySchema.parse(request.body);
      const workspace = await createWorkspace(
        app.prisma,
        request.auth!.user.id,
        body,
      );
      return reply
        .code(201)
        .send(createWorkspaceResponseSchema.parse({ workspace }));
    },
  );

  app.get(
    "/workspaces",
    { preHandler: [app.authenticate] },
    async (request) => {
      const workspaces = await listMyWorkspaces(
        app.prisma,
        request.auth!.user.id,
      );
      return workspaceListResponseSchema.parse({ workspaces });
    },
  );

  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId",
    { preHandler: [app.authenticate] },
    async (request) => {
      const workspace = await getWorkspaceForUser(
        app.prisma,
        request.auth!.user.id,
        request.params.workspaceId,
      );
      return workspaceDetailResponseSchema.parse({ workspace });
    },
  );

  app.post<{ Body: unknown }>(
    "/workspaces/join",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = joinWorkspaceBodySchema.parse(request.body);
      const workspace = await joinWorkspaceByToken(
        app.prisma,
        request.auth!.user.id,
        body,
      );
      return reply.send(joinWorkspaceResponseSchema.parse({ workspace }));
    },
  );

  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/snapshot",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const snapshot = await loadLatestSnapshot(
        app.prisma,
        request.auth!.user.id,
        request.params.workspaceId,
      );
      return reply.send(snapshot);
    },
  );

  /** Alias semantic pentru „ultimul snapshot”. */
  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/snapshot/latest",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const snapshot = await loadLatestSnapshot(
        app.prisma,
        request.auth!.user.id,
        request.params.workspaceId,
      );
      return reply.send(snapshot);
    },
  );

  app.put<{ Params: { workspaceId: string }; Body: unknown }>(
    "/workspaces/:workspaceId/snapshot",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      await saveSnapshot(
        app.prisma,
        request.auth!.user.id,
        request.params.workspaceId,
        request.body,
      );
      return reply.send({ ok: true });
    },
  );

  app.post<{ Params: { workspaceId: string }; Body: unknown }>(
    "/workspaces/:workspaceId/snapshot/autosave",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      await saveSnapshot(
        app.prisma,
        request.auth!.user.id,
        request.params.workspaceId,
        request.body,
      );
      return reply.send({ ok: true });
    },
  );
}
