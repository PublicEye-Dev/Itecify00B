import cookie from "@fastify/cookie";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { SESSION_COOKIE_NAME } from "@itecify/shared/auth";
import { HttpError } from "../modules/auth/errors.js";
import {
  clearSessionCookie,
  getAuthenticatedSession,
  setSessionCookie,
} from "../modules/auth/session.js";

export async function registerAuthPlugin(app: FastifyInstance): Promise<void> {
  await app.register(cookie);

  app.decorateRequest("auth", null);
  app.decorate("authenticate", async (request: FastifyRequest) => {
    if (!request.auth) {
      throw new HttpError(401, "Authentication required.");
    }
  });

  app.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      request.auth = null;

      const token = request.cookies?.[SESSION_COOKIE_NAME];
      if (!token) return;

      try {
        const session = await getAuthenticatedSession(app.prisma, token);
        if (!session) {
          clearSessionCookie(reply);
          return;
        }

        request.auth = {
          sessionId: session.sessionId,
          user: session.user,
        };

        if (session.shouldRefresh) {
          setSessionCookie(reply, token, session.expiresAt);
        }
      } catch (err) {
        /** DB lipsă / sesiune coruptă — nu blocăm login/signup cu 500 din hook. */
        request.log.warn({ err }, "Session bootstrap failed");
        clearSessionCookie(reply);
      }
    },
  );
}
