import {
  createRunJobBodySchema,
  getRunJobResponseSchema,
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

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const writeEvent = (event: string, payload: unknown): void => {
        reply.raw.write(`event: ${event}\n`);
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      writeEvent("snapshot", {
        status: job.status,
        stdout: job.stdout,
        stderr: job.stderr,
      });

      for (const ev of getRecentJobLogs(job.id)) {
        writeEvent("log", ev);
      }

      if (isTerminalStatus(job.status)) {
        writeEvent("done", { status: job.status, exitCode: job.exitCode });
        reply.raw.end();
        return;
      }

      const unsubscribe = subscribeJobLogs(job.id, (ev) => {
        writeEvent("log", ev);
      });

      const poll = setInterval(() => {
        void (async () => {
          const j = await getJobById(app.prisma, job.id);
          if (j && isTerminalStatus(j.status)) {
            writeEvent("snapshot", {
              status: j.status,
              stdout: j.stdout,
              stderr: j.stderr,
            });
            writeEvent("done", { status: j.status, exitCode: j.exitCode });
            clearInterval(poll);
            unsubscribe();
            reply.raw.end();
          }
        })();
      }, 500);

      request.raw.on("close", () => {
        clearInterval(poll);
        unsubscribe();
      });
    },
  );
}
