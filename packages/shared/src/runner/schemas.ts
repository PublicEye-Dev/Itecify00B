import { z } from "zod";

export const runTemplateSchema = z.enum(["javascript", "python", "java", "c"]);
export type RunTemplateDto = z.infer<typeof runTemplateSchema>;

export const runEntryPathSchema = z.string().trim().min(1).max(512);
export type RunEntryPathDto = z.infer<typeof runEntryPathSchema>;

export const runFindingSeveritySchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);
export type RunFindingSeverityDto = z.infer<typeof runFindingSeveritySchema>;

export const runScanOutcomeSchema = z.enum([
  "CLEAN",
  "WARN",
  "BLOCKED",
  "ERROR",
]);
export type RunScanOutcomeDto = z.infer<typeof runScanOutcomeSchema>;

export const runLogStreamSchema = z.enum(["stdout", "stderr", "system"]);
export type RunLogStreamDto = z.infer<typeof runLogStreamSchema>;

export const runStageStatusSchema = z.enum([
  "pending",
  "in_progress",
  "passed",
  "warning",
  "blocked",
  "failed",
  "timeout",
  "skipped",
]);
export type RunStageStatusDto = z.infer<typeof runStageStatusSchema>;

export const runJobStatusSchema = z.enum([
  "PENDING",
  "MATERIALIZING",
  "SCANNING",
  "BLOCKED",
  "BUILDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "TIMEOUT",
  "CANCELLED",
]);
export type RunJobStatusDto = z.infer<typeof runJobStatusSchema>;

export const runScanCountsSchema = z.object({
  low: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  critical: z.number().int().nonnegative(),
});
export type RunScanCountsDto = z.infer<typeof runScanCountsSchema>;

export const runScanFindingSchema = z.object({
  ruleId: z.string(),
  severity: runFindingSeveritySchema,
  message: z.string(),
  path: z.string(),
  startLine: z.number().int().positive(),
  startCol: z.number().int().positive(),
  endLine: z.number().int().positive(),
  endCol: z.number().int().positive(),
  category: z.string().nullable(),
});
export type RunScanFindingDto = z.infer<typeof runScanFindingSchema>;

export const runScanReportSchema = z.object({
  scanner: z.literal("semgrep-ce"),
  scannedAt: z.string().datetime(),
  outcome: runScanOutcomeSchema,
  blockOnSeverity: runFindingSeveritySchema,
  findingCount: z.number().int().nonnegative(),
  blockingFindingCount: z.number().int().nonnegative(),
  counts: runScanCountsSchema,
  findings: z.array(runScanFindingSchema),
  summary: z.string(),
});
export type RunScanReportDto = z.infer<typeof runScanReportSchema>;

export const runPhaseLimitsSchema = z.object({
  cpus: z.string().min(1),
  memory: z.string().min(1),
  timeoutMs: z.number().int().positive(),
});
export type RunPhaseLimitsDto = z.infer<typeof runPhaseLimitsSchema>;

export const runPolicySchema = z.object({
  maxLogBytes: z.number().int().positive(),
  blockOnSeverity: runFindingSeveritySchema,
  scan: runPhaseLimitsSchema,
  build: runPhaseLimitsSchema,
  run: runPhaseLimitsSchema,
});
export type RunPolicyDto = z.infer<typeof runPolicySchema>;

export const runLogStatsSchema = z.object({
  maxBytes: z.number().int().positive(),
  capturedBytes: z.number().int().nonnegative(),
  droppedBytes: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type RunLogStatsDto = z.infer<typeof runLogStatsSchema>;

export const runStageStateSchema = z.object({
  status: runStageStatusSchema,
  detail: z.string().nullable(),
});
export type RunStageStateDto = z.infer<typeof runStageStateSchema>;

export const runStagesSchema = z.object({
  scanning: runStageStateSchema,
  building: runStageStateSchema,
  running: runStageStateSchema,
});
export type RunStagesDto = z.infer<typeof runStagesSchema>;

export const runLogEntrySchema = z.object({
  sequence: z.number().int().positive(),
  stream: runLogStreamSchema,
  chunk: z.string(),
  createdAt: z.string().datetime(),
});
export type RunLogEntryDto = z.infer<typeof runLogEntrySchema>;

export const createRunJobBodySchema = z.object({
  workspaceId: z.string().min(1).max(256),
  template: runTemplateSchema,
  entryPath: runEntryPathSchema.optional(),
});
export type CreateRunJobBodyDto = z.infer<typeof createRunJobBodySchema>;

export const runJobPublicSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  template: runTemplateSchema,
  status: runJobStatusSchema,
  scanReport: runScanReportSchema.nullable(),
  policy: runPolicySchema,
  logStats: runLogStatsSchema,
  stages: runStagesSchema,
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

export const runJobStreamSnapshotSchema = z.object({
  job: runJobPublicSchema,
});
export type RunJobStreamSnapshotDto = z.infer<
  typeof runJobStreamSnapshotSchema
>;

export const runJobStreamLogSchema = z.object({
  entry: runLogEntrySchema,
});
export type RunJobStreamLogDto = z.infer<typeof runJobStreamLogSchema>;

export const runJobStreamDoneSchema = z.object({
  job: runJobPublicSchema,
});
export type RunJobStreamDoneDto = z.infer<typeof runJobStreamDoneSchema>;
