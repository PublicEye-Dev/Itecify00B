import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { FastifyReply } from "fastify";
import { SESSION_COOKIE_NAME } from "@itecify/shared/auth";
import { toUserDto } from "./mapper.js";
import { authDb, type DbSessionWithUser } from "./prisma.js";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const SESSION_REFRESH_INTERVAL_MS = 1000 * 60 * 15;

export type SessionTokenRecord = {
  token: string;
  expiresAt: Date;
};

export type AuthenticatedSession = {
  sessionId: string;
  user: ReturnType<typeof toUserDto>;
  expiresAt: Date;
  shouldRefresh: boolean;
};

function useSecureCookies(): boolean {
  if (process.env.AUTH_COOKIE_SECURE === "true") return true;
  if (process.env.AUTH_COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function buildExpiry(now = Date.now()): Date {
  return new Date(now + SESSION_TTL_MS);
}

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: useSecureCookies(),
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: useSecureCookies(),
  });
}

export async function createSession(
  prisma: PrismaClient,
  userId: string,
): Promise<SessionTokenRecord> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = buildExpiry();

  await authDb(prisma).session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function deleteSessionByToken(
  prisma: PrismaClient,
  token: string,
): Promise<void> {
  await authDb(prisma)
    .session.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    })
    .catch(() => undefined);
}

export async function getAuthenticatedSession(
  prisma: PrismaClient,
  token: string,
): Promise<AuthenticatedSession | null> {
  const session = (await authDb(prisma).session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  })) as DbSessionWithUser | null;

  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await authDb(prisma)
      .session.delete({ where: { id: session.id } })
      .catch(() => undefined);
    return null;
  }

  const shouldRefresh =
    now - session.lastSeenAt.getTime() >= SESSION_REFRESH_INTERVAL_MS;
  let expiresAt = session.expiresAt;

  if (shouldRefresh) {
    expiresAt = buildExpiry(now);
    await authDb(prisma).session.update({
      where: { id: session.id },
      data: {
        expiresAt,
        lastSeenAt: new Date(now),
      },
    });
  }

  return {
    sessionId: session.id,
    user: toUserDto(session.user),
    expiresAt,
    shouldRefresh,
  };
}
