import "./env.js";
import process from "node:process";
import cors from "@fastify/cors";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { createHealthPayload } from "@itecify/shared";
import { ZodError } from "zod";
import { HttpError, toErrorDto, toFieldErrors } from "./modules/auth/errors.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerAiRoutes } from "./modules/ai/ai.routes.js";
import { registerJobRoutes } from "./modules/jobs/job.routes.js";
import { registerTerminalRoutes } from "./modules/terminal/terminal.routes.js";
import { registerWorkspaceRoutes } from "./modules/workspaces/routes.js";
import { registerAuthPlugin } from "./plugins/auth.js";
import { registerPrismaPlugin } from "./plugins/prisma.js";

export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV === "production",
  });

  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      callback(null, origin ?? false);
    },
    /** Permite corelație request (header trimis din `createAiSuggestions` în dev). */
    allowedHeaders: ["Content-Type", "Authorization", "X-Ai-Request-Id"],
  });

  await registerPrismaPlugin(app);
  await registerAuthPlugin(app);

  app.setErrorHandler(
    (error: Error, request: FastifyRequest, reply: FastifyReply) => {
      if (error instanceof HttpError) {
        return reply
          .code(error.statusCode)
          .send(toErrorDto(error.message, error.fieldErrors));
      }

      if (error instanceof ZodError) {
        return reply
          .code(400)
          .send(toErrorDto("Invalid request payload.", toFieldErrors(error)));
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        request.log.error(
          { err: error, code: error.code, meta: error.meta },
          "Prisma error",
        );
        if (error.code === "P2021") {
          return reply
            .code(503)
            .send(
              toErrorDto(
                "Baza de date nu are tabelele actualizate (ex. workspace_snapshot_checkpoints). Rulează: pnpm prisma migrate deploy sau pnpm db:push",
              ),
            );
        }
      } else {
        request.log.error(error);
      }
      const isProd = process.env.NODE_ENV === "production";
      const fallback =
        !isProd && typeof error.message === "string" && error.message.length > 0
          ? error.message
          : "Internal server error.";
      return reply.code(500).send(toErrorDto(fallback));
    },
  );

  app.get("/health", async () => createHealthPayload("api"));
  await app.register(registerAuthRoutes, { prefix: "/auth" });
  await app.register(registerWorkspaceRoutes);
  await app.register(registerJobRoutes);
  await app.register(registerTerminalRoutes);
  await app.register(registerAiRoutes);

  return app;
}
