import {
  isWorkspaceSnapshotV1,
  type WorkspaceSnapshotV1,
} from "@itecify/shared";
import type { FastifyInstance } from "fastify";
import { HttpError } from "../auth/errors.js";
import { getSnapshot, setSnapshot } from "../../snapshotStore.js";

export async function registerWorkspaceRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/snapshot",
    { preHandler: [app.authenticate] },
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
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { workspaceId } = request.params;
      if (!isWorkspaceSnapshotV1(request.body)) {
        throw new HttpError(400, "Invalid workspace snapshot payload.");
      }

      setSnapshot(workspaceId, new Uint8Array(request.body.update));
      return reply.send({ ok: true });
    },
  );
}
