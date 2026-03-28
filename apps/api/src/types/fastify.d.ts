import type { PrismaClient } from "@prisma/client";
import type { preHandlerHookHandler } from "fastify";
import type { AuthenticatedRequestContext } from "../modules/auth/service.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    authenticate: preHandlerHookHandler;
  }

  interface FastifyRequest {
    auth: AuthenticatedRequestContext | null;
  }
}
