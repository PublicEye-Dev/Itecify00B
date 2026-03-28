import {
  authResponseSchema,
  loginRequestSchema,
  logoutResponseSchema,
  SESSION_COOKIE_NAME,
  signupRequestSchema,
} from "@itecify/shared/auth";
import type { FastifyInstance } from "fastify";
import { loginWithPassword, signupWithPassword } from "./service.js";
import {
  clearSessionCookie,
  deleteSessionByToken,
  setSessionCookie,
} from "./session.js";

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/signup", async (request, reply) => {
    const input = signupRequestSchema.parse(request.body);
    const result = await signupWithPassword(app.prisma, input);

    setSessionCookie(reply, result.sessionToken, result.sessionExpiresAt);
    return reply
      .code(201)
      .send(authResponseSchema.parse({ user: result.user }));
  });

  app.post("/login", async (request, reply) => {
    const input = loginRequestSchema.parse(request.body);
    const result = await loginWithPassword(app.prisma, input);

    setSessionCookie(reply, result.sessionToken, result.sessionExpiresAt);
    return reply.send(authResponseSchema.parse({ user: result.user }));
  });

  app.post("/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (token) {
      await deleteSessionByToken(app.prisma, token);
    }

    clearSessionCookie(reply);
    return reply.send(logoutResponseSchema.parse({ success: true }));
  });

  app.get("/me", { preHandler: [app.authenticate] }, async (request) => {
    return authResponseSchema.parse({ user: request.auth!.user });
  });
}
