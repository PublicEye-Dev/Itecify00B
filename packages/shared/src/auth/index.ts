import { z } from "zod";

const emailSchema = z.string().trim().min(1).max(320).email();
const passwordSchema = z.string().min(8).max(128);
const displayNameSchema = z.string().trim().min(1).max(80);

export const SESSION_COOKIE_NAME = "itecify_session";

export const userRoleSchema = z.enum(["owner", "editor"]);

export const signupRequestSchema = z.object({
  name: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const userDtoSchema = z.object({
  id: z.string().uuid(),
  email: emailSchema,
  name: displayNameSchema,
  role: userRoleSchema,
  createdAt: z.string().datetime({ offset: true }),
});

export const authResponseSchema = z.object({
  user: userDtoSchema,
});

export const logoutResponseSchema = z.object({
  success: z.literal(true),
});

export const apiErrorSchema = z.object({
  message: z.string(),
  fieldErrors: z.record(z.array(z.string())).optional(),
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type SignupRequestDto = z.infer<typeof signupRequestSchema>;
export type LoginRequestDto = z.infer<typeof loginRequestSchema>;
export type UserDto = z.infer<typeof userDtoSchema>;
export type AuthResponseDto = z.infer<typeof authResponseSchema>;
export type LogoutResponseDto = z.infer<typeof logoutResponseSchema>;
export type ApiErrorDto = z.infer<typeof apiErrorSchema>;
