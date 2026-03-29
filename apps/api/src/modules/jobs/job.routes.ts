import {
  createRunJobBodySchema,
  getRunJobResponseSchema,
  runJobStreamDoneSchema,
  runJobStreamLogSchema,
  runJobStreamSnapshotSchema,
} from "@itecify/shared/runner";
import type { FastifyInstance } from "fastify";
import { HttpError } from "../auth/errors.js";
import { getRecentJobLogs, subscribeJobLogs } from "../runner/jobLogBus.js";
import { assertWorkspaceMember } from "../workspaces/workspace.service.js";
import { createJob, getJobById, isTerminalStatus } from "./job.service.js";
import { toRunJobPublicDto } from "./job.mapper.js";

export async function registerJobRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: unknown }>(
    "/jobs",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = createRunJobBodySchema.parse(request.body);
      const job = await createJob(
        app.prisma,
        request.auth!.user.id,
        body.workspaceId,
        body.template,
        body.entryPath,
      );
      return reply.code(202).send({ job });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/jobs/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const job = await getJobById(app.prisma, request.params.id);
      if (!job) {
        throw new HttpError(404, "Job inexistent.");
      }
      await assertWorkspaceMember(
        app.prisma,
        request.auth!.user.id,
        job.workspaceId,
      );
      return reply.send(
        getRunJobResponseSchema.parse({ job: toRunJobPublicDto(job) }),
      );
    },
  );

  app.get<{ Params: { id: string } }>(
    "/jobs/:id/stream",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const job = await getJobById(app.prisma, request.params.id);
      if (!job) {
        throw new HttpError(404, "Job inexistent.");
      }
      await assertWorkspaceMember(
        app.prisma,
        request.auth!.user.id,
        job.workspaceId,
      );

      const lastEventIdRaw = request.headers["last-event-id"];
      const lastEventId = Number(
        Array.isArray(lastEventIdRaw)
          ? lastEventIdRaw[0]
          : (lastEventIdRaw ?? "0"),
      );

      const requestOrigin = Array.isArray(request.headers.origin)
        ? request.headers.origin[0]
        : request.headers.origin;

      reply.hijack();
      const headers: Record<string, string> = {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        Vary: "Origin",
      };

      if (requestOrigin) {
        headers["Access-Control-Allow-Origin"] = requestOrigin;
        headers["Access-Control-Allow-Credentials"] = "true";
      }

      reply.raw.writeHead(200, headers);
      reply.raw.write("retry: 1500\n\n");
      reply.raw.flushHeaders?.();

      let closed = false;

      const writeEvent = (
        event: string,
        payload: unknown,
        id?: number,
      ): void => {
        if (closed) return;
        if (id != null) {
          reply.raw.write(`id: ${id}\n`);
        }
        reply.raw.write(`event: ${event}\n`);
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      const initialJob = toRunJobPublicDto(job);
      writeEvent(
        "snapshot",
        runJobStreamSnapshotSchema.parse({ job: initialJob }),
      );

      if (lastEventId > 0) {
        for (const ev of getRecentJobLogs(job.id, lastEventId)) {
          writeEvent(
            "log",
            runJobStreamLogSchema.parse({ entry: ev }),
            ev.sequence,
          );
        }
      }

      if (isTerminalStatus(job.status)) {
        writeEvent("done", runJobStreamDoneSchema.parse({ job: initialJob }));
        reply.raw.end();
        return;
      }

      const unsubscribe = subscribeJobLogs(job.id, (ev) => {
        if (ev.type === "log") {
          writeEvent(
            "log",
            runJobStreamLogSchema.parse({ entry: ev.entry }),
            ev.sequence,
          );
          return;
        }

        writeEvent(
          "snapshot",
          runJobStreamSnapshotSchema.parse({ job: ev.job }),
          ev.sequence,
        );

        if (isTerminalStatus(ev.job.status)) {
          writeEvent(
            "done",
            runJobStreamDoneSchema.parse({ job: ev.job }),
            ev.sequence,
          );
          cleanup();
        }
      });

      const heartbeat = setInterval(() => {
        if (!closed) {
          reply.raw.write(": keep-alive\n\n");
        }
      }, 15000);

      const cleanup = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        reply.raw.end();
      };

      request.raw.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
        closed = true;
      });
    },
  );
}
