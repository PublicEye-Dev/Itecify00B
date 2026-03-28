import type { PrismaClient } from "@prisma/client";

export type DbUserRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
};

export type DbSessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  lastSeenAt: Date;
};

export type DbSessionWithUser = DbSessionRecord & {
  user: DbUserRecord;
};

export type AuthPrismaClient = PrismaClient & {
  user: {
    findUnique(args: unknown): Promise<DbUserRecord | null>;
    create(args: unknown): Promise<DbUserRecord>;
  };
  session: {
    create(args: unknown): Promise<DbSessionRecord>;
    findUnique(args: unknown): Promise<DbSessionWithUser | null>;
    delete(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<DbSessionRecord>;
    deleteMany(args: unknown): Promise<unknown>;
  };
};

export function authDb(prisma: PrismaClient): AuthPrismaClient {
  return prisma as AuthPrismaClient;
}
