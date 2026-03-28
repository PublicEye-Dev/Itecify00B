import { userDtoSchema, type UserDto } from "@itecify/shared/auth";
import type { DbUserRecord } from "./prisma.js";

export function toUserDto(user: DbUserRecord): UserDto {
  return userDtoSchema.parse({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role === "OWNER" ? "owner" : "editor",
    createdAt: user.createdAt.toISOString(),
  });
}
