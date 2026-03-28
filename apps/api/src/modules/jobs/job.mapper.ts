import type { Prisma, RunJob } from "@prisma/client";
import {
  runJobPublicSchema,
  runLogStatsSchema,
  runPolicySchema,
  runScanReportSchema,
  runStagesSchema,
  type RunJobPublicDto,
  type RunLogStatsDto,
  type RunPolicyDto,
  type RunScanReportDto,
  type RunStageStateDto,
  type RunStagesDto,
  type RunTemplateDto,
} from "@itecify/shared/runner";
import { resolveRunPolicy } from "../security/policy.js";
import { getRecipe } from "../runtime-templates/recipes.js";

function parseJson<T>(
  value: Prisma.JsonValue | null,
  parser: { parse: (input: unknown) => T },
  fallback: T,
): T {
  if (value == null) return fallback;
  return parser.parse(value);
}

function stage(
  status: RunStageStateDto["status"],
  detail: string | null,
): RunStageStateDto {
  return { status, detail };
}

function deriveStages(job: {
  status: RunJob["status"];
  template: RunTemplateDto;
  errorCode: string | null;
  errorMessage: string | null;
  scanReport: RunScanReportDto | null;
}): RunStagesDto {
  const hasBuildStep = getRecipe(job.template).buildScript != null;
  const scanFailed =
    job.errorCode === "SECURITY_SCAN_FAILED" ||
    job.errorCode === "SECURITY_SCAN_TIMEOUT" ||
    job.errorCode === "SECURITY_SCAN_PARSE_FAILED";
  const blocked =
    job.status === "BLOCKED" || job.errorCode === "SECURITY_SCAN_BLOCKED";
  const buildFailed =
    job.errorCode === "BUILD_FAILED" || job.errorCode === "DOCKER_BUILD_FAILED";
  const buildTimedOut = job.errorCode === "BUILD_TIMEOUT";
  const runTimedOut =
    job.errorCode === "RUN_TIMEOUT" || job.status === "TIMEOUT";
  const runFailed =
    job.errorCode === "RUN_FAILED" ||
    job.errorCode === "DOCKER_RUN_FAILED" ||
    job.errorCode === "NONZERO_EXIT" ||
    (job.status === "FAILED" && !scanFailed && !buildFailed && !buildTimedOut);

  let scanning = stage("pending", "Queued before the security scan starts.");
  if (job.status === "SCANNING") {
    scanning = stage("in_progress", "Semgrep CE is analyzing the workspace.");
  } else if (blocked) {
    scanning = stage(
      "blocked",
      job.scanReport?.summary ??
        job.errorMessage ??
        "Execution was blocked by the security policy.",
    );
  } else if (job.scanReport) {
    if (job.scanReport.outcome === "CLEAN") {
      scanning = stage("passed", job.scanReport.summary);
    } else if (job.scanReport.outcome === "WARN") {
      scanning = stage("warning", job.scanReport.summary);
    } else if (job.scanReport.outcome === "ERROR") {
      scanning = stage("failed", job.scanReport.summary);
    } else {
      scanning = stage("blocked", job.scanReport.summary);
    }
  } else if (scanFailed) {
    scanning = stage("failed", job.errorMessage ?? "Security scan failed.");
  } else if (job.status !== "PENDING" && job.status !== "MATERIALIZING") {
    scanning = stage(
      "skipped",
      "No security scan data was recorded for this run.",
    );
  }

  let building = hasBuildStep
    ? stage("pending", "Waiting for the build phase.")
    : stage("passed", "No separate build step is required for this template.");

  if (blocked || scanFailed) {
    building = stage("skipped", "Execution stopped before build.");
  } else if (hasBuildStep && job.status === "BUILDING") {
    building = stage(
      "in_progress",
      "Build container is compiling the workspace.",
    );
  } else if (hasBuildStep && buildTimedOut) {
    building = stage("timeout", job.errorMessage ?? "Build timed out.");
  } else if (hasBuildStep && buildFailed) {
    building = stage("failed", job.errorMessage ?? "Build failed.");
  } else if (
    hasBuildStep &&
    (job.status === "RUNNING" ||
      job.status === "SUCCEEDED" ||
      job.status === "TIMEOUT" ||
      job.status === "CANCELLED" ||
      runFailed)
  ) {
    building = stage("passed", "Build completed and handed off to execution.");
  }

  let running = stage("pending", "Waiting for the execution phase.");
  if (blocked || scanFailed || buildFailed || buildTimedOut) {
    running = stage("skipped", "Execution did not start.");
  } else if (job.status === "RUNNING") {
    running = stage("in_progress", "Container is currently running.");
  } else if (job.status === "SUCCEEDED") {
    running = stage("passed", "Execution completed successfully.");
  } else if (runTimedOut) {
    running = stage("timeout", job.errorMessage ?? "Execution timed out.");
  } else if (runFailed || job.status === "CANCELLED") {
    running = stage("failed", job.errorMessage ?? "Execution failed.");
  }

  return runStagesSchema.parse({ scanning, building, running });
}

export function toRunJobPublicDto(job: RunJob): RunJobPublicDto {
  const template = job.template as RunTemplateDto;
  const policy = parseJson(
    job.runPolicy as Prisma.JsonValue | null,
    runPolicySchema,
    resolveRunPolicy(template),
  );
  const logStats = parseJson(
    job.logStats as Prisma.JsonValue | null,
    runLogStatsSchema,
    {
      maxBytes: policy.maxLogBytes,
      capturedBytes: Buffer.byteLength(`${job.stdout}${job.stderr}`, "utf8"),
      droppedBytes: 0,
      truncated: false,
    } satisfies RunLogStatsDto,
  );
  const scanReport = parseJson(
    job.scanReport as Prisma.JsonValue | null,
    runScanReportSchema,
    null,
  );

  return runJobPublicSchema.parse({
    id: job.id,
    workspaceId: job.workspaceId,
    template: job.template,
    status: job.status,
    scanReport,
    policy,
    logStats,
    stages: deriveStages({
      status: job.status,
      template,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      scanReport,
    }),
    exitCode: job.exitCode,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    stdout: job.stdout,
    stderr: job.stderr,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  });
}
