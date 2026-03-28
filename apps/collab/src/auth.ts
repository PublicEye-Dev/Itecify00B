import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE_NAME } from "@itecify/shared/auth";

type SessionRecord = {
  id: string;
  expiresAt: Date;
};

type CollabPrismaClient = PrismaClient & {
  session: {
    findUnique(args: unknown): Promise<SessionRecord | null>;
    delete(args: unknown): Promise<unknown>;
  };
};

function collabDb(prisma: PrismaClient): CollabPrismaClient {
  return prisma as CollabPrismaClient;
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};

  return header
    .split(";")
    .reduce<Record<string, string>>((accumulator, entry) => {
      const [rawName, ...rawValueParts] = entry.trim().split("=");
      if (!rawName || rawValueParts.length === 0) return accumulator;

      const value = rawValueParts.join("=");
      try {
        accumulator[rawName] = decodeURIComponent(value);
      } catch {
        accumulator[rawName] = value;
      }
      return accumulator;
    }, {});
}

export async function hasValidSession(
  prisma: PrismaClient,
  cookieHeader: string | undefined,
): Promise<boolean> {
  const token = parseCookies(cookieHeader)[SESSION_COOKIE_NAME];
  if (!token) return false;

  const session = await collabDb(prisma).session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: { id: true, expiresAt: true },
  });

  if (!session) return false;
  if (session.expiresAt.getTime() > Date.now()) return true;

  await collabDb(prisma)
    .session.delete({ where: { id: session.id } })
    .catch(() => undefined);
  return false;
}
