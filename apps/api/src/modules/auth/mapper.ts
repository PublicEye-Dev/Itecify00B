import { Role } from "@prisma/client";
import { userDtoSchema, type UserDto } from "@itecify/shared/auth";
import type { DbUserRecord } from "./prisma.js";

export function toUserDto(user: DbUserRecord): UserDto {
  const role = user.role === Role.OWNER ? "owner" : "editor";
  return userDtoSchema.parse({
    id: user.id,
    email: user.email,
    name: user.name,
    role,
    createdAt: user.createdAt.toISOString(),
  });
}
