import { z } from "zod";

export const runTemplateSchema = z.enum(["javascript", "python", "java", "c"]);
export type RunTemplateDto = z.infer<typeof runTemplateSchema>;

export const runJobStatusSchema = z.enum([
  "PENDING",
  "MATERIALIZING",
  "BUILDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "TIMEOUT",
  "CANCELLED",
]);
export type RunJobStatusDto = z.infer<typeof runJobStatusSchema>;

export const createRunJobBodySchema = z.object({
  workspaceId: z.string().min(1).max(256),
  template: runTemplateSchema,
});
export type CreateRunJobBodyDto = z.infer<typeof createRunJobBodySchema>;

export const runJobPublicSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  template: runTemplateSchema,
  status: runJobStatusSchema,
  exitCode: z.number().int().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  startedAt: z.coerce.date().nullable(),
  finishedAt: z.coerce.date().nullable(),
});
export type RunJobPublicDto = z.infer<typeof runJobPublicSchema>;

export const createRunJobResponseSchema = z.object({
  job: runJobPublicSchema,
});

export const getRunJobResponseSchema = z.object({
  job: runJobPublicSchema,
});
