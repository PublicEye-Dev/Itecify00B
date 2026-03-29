import {
  terminalEnsureSandboxResponseSchema,
  terminalSandboxStatusSchema,
} from "@itecify/shared/terminal";
import fastifyWebsocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import { HttpError } from "../auth/errors.js";
import { assertWorkspaceMember } from "../workspaces/workspace.service.js";
import { attachTerminalSocket } from "./terminalRoomManager.js";
import {
  clearSandbox,
  getRegisteredSandbox,
  registerSandbox,
} from "./sandboxRegistry.js";
import {
  containerNameForWorkspace,
  ensureWorkspaceSandbox,
  isSandboxContainerActive,
} from "./workspaceSandbox.service.js";
import { dockerInspectRunning } from "./dockerCli.js";

export async function registerTerminalRoutes(
  app: FastifyInstance,
): Promise<void> {
  await app.register(fastifyWebsocket);

  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/terminal/status",
    { preHandler: [app.authenticate] },
    async (request) => {
      if (!request.auth) {
        throw new HttpError(401, "Autentificare necesară.");
      }
      const { workspaceId } = request.params;
      await assertWorkspaceMember(
        app.prisma,
        request.auth.user.id,
        workspaceId,
      );

      let reg = getRegisteredSandbox(workspaceId);
      if (!reg) {
        const recoveredName = containerNameForWorkspace(workspaceId);
        if ((await dockerInspectRunning(recoveredName)) === true) {
          registerSandbox(workspaceId, recoveredName);
          reg = getRegisteredSandbox(workspaceId);
        }
      }

      if (!reg) {
        return terminalSandboxStatusSchema.parse({
          active: false,
          containerName: null,
        });
      }

      const active = await isSandboxContainerActive(
        workspaceId,
        reg.containerName,
      );
      if (!active) {
        clearSandbox(workspaceId);
        return terminalSandboxStatusSchema.parse({
          active: false,
          containerName: null,
        });
      }

      return terminalSandboxStatusSchema.parse({
        active: true,
        containerName: reg.containerName,
      });
    },
  );

  app.post<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/terminal/sandbox",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!request.auth) {
        throw new HttpError(401, "Autentificare necesară.");
      }
      const { workspaceId } = request.params;

      try {
        const { containerName } = await ensureWorkspaceSandbox(
          app.prisma,
          request.auth.user.id,
          workspaceId,
        );
        return reply
          .code(201)
          .send(
            terminalEnsureSandboxResponseSchema.parse({
              ok: true as const,
              containerName,
            }),
          );
      } catch (cause) {
        if (cause instanceof HttpError) {
          throw cause;
        }
        const message =
          cause instanceof Error ? cause.message : "Eroare la pornirea sandbox-ului.";
        throw new HttpError(500, message);
      }
    },
  );

  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/terminal/stream",
    { websocket: true },
    (socket, request) => {
      if (!request.auth) {
        socket.close(4401, "Unauthorized");
        return;
      }

      const { workspaceId } = request.params;
      const userId = request.auth.user.id;
      const userName = request.auth.user.name;

      void (async () => {
        try {
          await assertWorkspaceMember(app.prisma, userId, workspaceId);
        } catch {
          socket.close(1008, "Forbidden");
          return;
        }

        let reg = getRegisteredSandbox(workspaceId);
        if (!reg) {
          const recoveredName = containerNameForWorkspace(workspaceId);
          if ((await dockerInspectRunning(recoveredName)) === true) {
            registerSandbox(workspaceId, recoveredName);
            reg = getRegisteredSandbox(workspaceId);
          }
        }

        if (!reg) {
          socket.send(
            JSON.stringify({
              type: "status",
              kind: "no_container",
              message: "Sandbox-ul nu este pornit.",
            }),
          );
          socket.close();
          return;
        }

        const active = await isSandboxContainerActive(
          workspaceId,
          reg.containerName,
        );
        if (!active) {
          clearSandbox(workspaceId);
          socket.send(
            JSON.stringify({
              type: "status",
              kind: "no_container",
              message: "Containerul nu mai rulează.",
            }),
          );
          socket.close();
          return;
        }

        attachTerminalSocket({
          workspaceId,
          containerName: reg.containerName,
          socket,
          userId,
          userName,
        });
      })();
    },
  );
}
