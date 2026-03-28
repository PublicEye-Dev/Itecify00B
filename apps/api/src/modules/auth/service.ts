import * as argon2 from "argon2";
import type { PrismaClient } from "@prisma/client";
import {
  type LoginRequestDto,
  type SignupRequestDto,
  type UserDto,
} from "@itecify/shared/auth";
import { HttpError } from "./errors.js";
import { toUserDto } from "./mapper.js";
import { authDb, type DbUserRecord } from "./prisma.js";
import { createSession } from "./session.js";

const PASSWORD_HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export type AuthenticatedRequestContext = {
  sessionId: string;
  user: UserDto;
};

export type AuthResult = {
  user: UserDto;
  sessionToken: string;
  sessionExpiresAt: Date;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2002",
  );
}

async function createAuthenticatedSession(
  prisma: PrismaClient,
  user: DbUserRecord,
): Promise<AuthResult> {
  const session = await createSession(prisma, user.id);

  return {
    user: toUserDto(user),
    sessionToken: session.token,
    sessionExpiresAt: session.expiresAt,
  };
}

export async function signupWithPassword(
  prisma: PrismaClient,
  input: SignupRequestDto,
): Promise<AuthResult> {
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedName = normalizeName(input.name);
  const db = authDb(prisma);

  const existingUser = await db.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    throw new HttpError(409, "An account with this email already exists.", {
      email: ["Email is already registered."],
    });
  }

  const passwordHash = await argon2.hash(input.password, PASSWORD_HASH_OPTIONS);

  let user: DbUserRecord;
  try {
    user = await db.user.create({
      data: {
        email: normalizedEmail,
        name: normalizedName,
        passwordHash,
        role: "EDITOR",
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new HttpError(409, "An account with this email already exists.", {
        email: ["Email is already registered."],
      });
    }

    throw error;
  }

  return createAuthenticatedSession(prisma, user);
}

export async function loginWithPassword(
  prisma: PrismaClient,
  input: LoginRequestDto,
): Promise<AuthResult> {
  const normalizedEmail = normalizeEmail(input.email);
  const db = authDb(prisma);

  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    throw new HttpError(401, "Invalid email or password.");
  }

  const isValidPassword = await argon2.verify(
    user.passwordHash,
    input.password,
  );
  if (!isValidPassword) {
    throw new HttpError(401, "Invalid email or password.");
  }

  return createAuthenticatedSession(prisma, user);
}
