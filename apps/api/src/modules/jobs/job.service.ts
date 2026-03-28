import * as fs from "node:fs/promises";
import * as fssync from "node:fs";
import * as os from "node:os";
import path from "node:path";
import process from "node:process";
import { Prisma, type PrismaClient } from "@prisma/client";
import { RunJobStatus, RunTemplate, type RunJob } from "@prisma/client";
import {
  runLogStatsSchema,
  runPolicySchema,
  type RunLogStatsDto,
  type RunPolicyDto,
  type RunTemplateDto,
} from "@itecify/shared/runner";
import { getSnapshotBytesForWorkspace } from "../snapshots/snapshot.service.js";
import { runInDocker } from "../runner/dockerRunner.js";
import {
  clearJobLogBuffer,
  emitJobLog,
  emitJobSnapshot,
} from "../runner/jobLogBus.js";
import { materializeYjsSnapshotToDir } from "../runner/materializeWorkspace.js";
import { getRecipe } from "../runtime-templates/recipes.js";
import { resolveRunPolicy } from "../security/policy.js";
import { runSemgrepScan } from "../security/semgrep.js";
import { assertWorkspaceMember } from "../workspaces/workspace.service.js";
import { toRunJobPublicDto } from "./job.mapper.js";

const TERMINAL: RunJobStatus[] = [
  RunJobStatus.SUCCEEDED,
  RunJobStatus.FAILED,
  RunJobStatus.TIMEOUT,
  RunJobStatus.CANCELLED,
  RunJobStatus.BLOCKED,
];

export function isTerminalStatus(s: RunJobStatus): boolean {
  return TERMINAL.includes(s);
}

const templateToPrisma: Record<RunTemplateDto, RunTemplate> = {
  javascript: RunTemplate.javascript,
  python: RunTemplate.python,
  java: RunTemplate.java,
  c: RunTemplate.c,
};

function workRootFor(jobId: string): string {
  const base = process.env.RUNNER_WORK_ROOT ?? os.tmpdir();
  return path.join(base, "itecify-runs", jobId);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseRunPolicy(
  value: Prisma.JsonValue | null,
  template: RunTemplateDto,
): RunPolicyDto {
  return value == null
    ? resolveRunPolicy(template)
    : runPolicySchema.parse(value);
}

function truncateUtf8(input: string, maxBytes: number): string {
  if (Buffer.byteLength(input, "utf8") <= maxBytes) {
    return input;
  }

  let end = input.length;
  while (end > 0 && Buffer.byteLength(input.slice(0, end), "utf8") > maxBytes) {
    end -= 1;
  }
  return input.slice(0, end);
}

function createLogAccumulator(jobId: string, maxBytes: number) {
  let stdoutAcc = "";
  let stderrAcc = "";
  let stats = runLogStatsSchema.parse({
    maxBytes,
    capturedBytes: 0,
    droppedBytes: 0,
    truncated: false,
  });
  let truncationNoticeSent = false;

  const emitTruncationNotice = (): void => {
    if (truncationNoticeSent) return;
    truncationNoticeSent = true;
    emitJobLog(jobId, {
      stream: "system",
      chunk: `[runner] Log output truncated after ${maxBytes} bytes. Further output was dropped.\n`,
    });
  };

  const append = (
    stream: "stdout" | "stderr" | "system",
    chunk: string,
  ): void => {
    if (!chunk) return;

    const totalBytes = Buffer.byteLength(chunk, "utf8");
    const remainingBytes = Math.max(0, stats.maxBytes - stats.capturedBytes);

    if (remainingBytes === 0) {
      stats = {
        ...stats,
        truncated: true,
        droppedBytes: stats.droppedBytes + totalBytes,
      } satisfies RunLogStatsDto;
      emitTruncationNotice();
      return;
    }

    const acceptedChunk =
      totalBytes <= remainingBytes
        ? chunk
        : truncateUtf8(chunk, remainingBytes);
    const acceptedBytes = Buffer.byteLength(acceptedChunk, "utf8");
    if (acceptedChunk) {
      if (stream === "stdout") {
        stdoutAcc += acceptedChunk;
      } else {
        stderrAcc += acceptedChunk;
      }

      stats = {
        ...stats,
        capturedBytes: stats.capturedBytes + acceptedBytes,
      } satisfies RunLogStatsDto;
      emitJobLog(jobId, { stream, chunk: acceptedChunk });
    }

    if (acceptedBytes < totalBytes) {
      stats = {
        ...stats,
        truncated: true,
        droppedBytes: stats.droppedBytes + (totalBytes - acceptedBytes),
      } satisfies RunLogStatsDto;
      emitTruncationNotice();
    }
  };

  return {
    append,
    getStdout: (): string => stdoutAcc,
    getStderr: (): string => stderrAcc,
    getStats: (): RunLogStatsDto => stats,
  };
}

function debounceFlush(
  jobId: string,
  prisma: PrismaClient,
  getStdout: () => string,
  getStderr: () => string,
  getLogStats: () => RunLogStatsDto,
): { schedule: () => void; flushNow: () => Promise<void> } {
  let t: NodeJS.Timeout | null = null;

  const flushNow = async (): Promise<void> => {
    if (t) {
      clearTimeout(t);
      t = null;
    }

    await prisma.runJob.update({
      where: { id: jobId },
      data: {
        stdout: getStdout(),
        stderr: getStderr(),
        logStats: toJsonValue(getLogStats()),
      },
    });
  };

  return {
    schedule: () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        void prisma.runJob.update({
          where: { id: jobId },
          data: {
            stdout: getStdout(),
            stderr: getStderr(),
            logStats: toJsonValue(getLogStats()),
          },
        });
      }, 250);
    },
    flushNow,
  };
}

async function updateJob(
  prisma: PrismaClient,
  jobId: string,
  data: Prisma.RunJobUpdateInput,
): Promise<RunJob> {
  const job = await prisma.runJob.update({ where: { id: jobId }, data });
  emitJobSnapshot(jobId, toRunJobPublicDto(job));
  return job;
}

async function runOrchestrator(
  prisma: PrismaClient,
  jobId: string,
): Promise<void> {
  let workDir: string | null = null;
  let policy: RunPolicyDto | null = null;
  let logs = createLogAccumulator(jobId, 128 * 1024);
  const flush = debounceFlush(
    jobId,
    prisma,
    () => logs.getStdout(),
    () => logs.getStderr(),
    () => logs.getStats(),
  );

  const fail = async (
    status: RunJobStatus,
    errorCode: string,
    message: string,
  ): Promise<void> => {
    await flush.flushNow().catch(() => undefined);
    await updateJob(prisma, jobId, {
      status,
      errorCode,
      errorMessage: message,
      stdout: logs.getStdout(),
      stderr: logs.getStderr(),
      logStats: toJsonValue(logs.getStats()),
      finishedAt: new Date(),
      workDir: null,
    });
  };

  const appendLog = (
    stream: "stdout" | "stderr" | "system",
    chunk: string,
  ): void => {
    logs.append(stream, chunk);
    flush.schedule();
  };

  const appendSystemLog = (chunk: string): void => {
    appendLog("system", chunk);
  };

  try {
    const job = await prisma.runJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    policy = parseRunPolicy(
      job.runPolicy as Prisma.JsonValue | null,
      job.template as RunTemplateDto,
    );
    logs = createLogAccumulator(jobId, policy.maxLogBytes);

    workDir = workRootFor(jobId);
    await fs.mkdir(workDir, { recursive: true });

    await updateJob(prisma, jobId, {
      status: RunJobStatus.MATERIALIZING,
      workDir,
      startedAt: new Date(),
    });

    const snapshot = await getSnapshotBytesForWorkspace(
      prisma,
      job.workspaceId,
    );
    const { fileCount } = await materializeYjsSnapshotToDir(snapshot, workDir);

    if (fileCount === 0 && (!snapshot || snapshot.length === 0)) {
      await fail(
        RunJobStatus.FAILED,
        "EMPTY_WORKSPACE",
        "Snapshot lipsă sau workspace fără fișiere.",
      );
      return;
    }

    const recipe = getRecipe(job.template as RunTemplateDto);
    const entryPath = path.join(workDir, recipe.requiredEntry);
    if (!fssync.existsSync(entryPath)) {
      await fail(
        RunJobStatus.FAILED,
        "MISSING_ENTRY",
        `Lipsește fișierul obligatoriu pentru șablon: ${recipe.requiredEntry}`,
      );
      return;
    }

    const label = `itecify.job.id=${jobId}`;
    await updateJob(prisma, jobId, {
      status: RunJobStatus.SCANNING,
      errorCode: null,
      errorMessage: null,
    });

    let scanReport;
    try {
      scanReport = await runSemgrepScan({
        jobId,
        label,
        template: job.template as RunTemplateDto,
        workDir,
        policy,
        onSystemLog: appendSystemLog,
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      if (raw === "SECURITY_SCAN_TIMEOUT") {
        await fail(
          RunJobStatus.FAILED,
          "SECURITY_SCAN_TIMEOUT",
          `Security scan timed out after ${policy.scan.timeoutMs} ms.`,
        );
      } else if (raw === "SECURITY_SCAN_PARSE_FAILED") {
        await fail(
          RunJobStatus.FAILED,
          "SECURITY_SCAN_PARSE_FAILED",
          "Security scan returned an invalid JSON payload.",
        );
      } else {
        const message = raw.startsWith("SECURITY_SCAN_FAILED:")
          ? raw.slice("SECURITY_SCAN_FAILED:".length)
          : raw;
        await fail(
          RunJobStatus.FAILED,
          "SECURITY_SCAN_FAILED",
          `Security scan failed: ${message}`,
        );
      }
      return;
    }

    await updateJob(prisma, jobId, {
      scanReport: toJsonValue(scanReport),
    });

    if (scanReport.outcome === "BLOCKED") {
      await fail(
        RunJobStatus.BLOCKED,
        "SECURITY_SCAN_BLOCKED",
        `Execution blocked by Semgrep: ${scanReport.blockingFindingCount} finding(s) met the ${scanReport.blockOnSeverity}+ policy.`,
      );
      return;
    }

    await updateJob(prisma, jobId, {
      status: RunJobStatus.BUILDING,
      errorCode: null,
      errorMessage: null,
    });

    if (recipe.buildScript) {
      appendSystemLog(
        `[build] Starting build stage with ${policy.build.cpus} CPU / ${policy.build.memory} / ${policy.build.timeoutMs} ms.\n`,
      );

      try {
        const buildResult = await runInDocker({
          workDirHost: workDir,
          image: recipe.dockerImage,
          command: ["sh", "-c", recipe.buildScript],
          label: `${label}.build`,
          containerName: `itecify-build-${jobId}`,
          timeoutMs: policy.build.timeoutMs,
          limits: policy.build,
          onStdout: (chunk) => {
            appendLog("stdout", chunk);
          },
          onStderr: (chunk) => {
            appendLog("stderr", chunk);
          },
        });

        const code = buildResult.exitCode ?? 1;
        if (code !== 0) {
          appendSystemLog(`[build] Build stage exited with code ${code}.\n`);
          await fail(
            RunJobStatus.FAILED,
            "BUILD_FAILED",
            `Build stage exited with code ${code}.`,
          );
          return;
        }
        appendSystemLog("[build] Build stage completed.\n");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === "TIMEOUT") {
          await fail(
            RunJobStatus.FAILED,
            "BUILD_TIMEOUT",
            `Build stage timed out after ${policy.build.timeoutMs} ms.`,
          );
        } else {
          await fail(RunJobStatus.FAILED, "DOCKER_BUILD_FAILED", message);
        }
        return;
      }
    } else {
      appendSystemLog(
        "[build] No separate build step is required for this template.\n",
      );
    }

    await updateJob(prisma, jobId, {
      status: RunJobStatus.RUNNING,
      errorCode: null,
      errorMessage: null,
    });

    try {
      appendSystemLog(
        `[run] Starting run stage with ${policy.run.cpus} CPU / ${policy.run.memory} / ${policy.run.timeoutMs} ms.\n`,
      );
      const result = await runInDocker({
        workDirHost: workDir,
        image: recipe.dockerImage,
        command: ["sh", "-c", recipe.runScript],
        label: `${label}.run`,
        containerName: `itecify-run-${jobId}`,
        timeoutMs: policy.run.timeoutMs,
        limits: policy.run,
        onStdout: (chunk) => {
          appendLog("stdout", chunk);
        },
        onStderr: (chunk) => {
          appendLog("stderr", chunk);
        },
      });

      const code = result.exitCode ?? 1;
      if (code !== 0) {
        appendSystemLog(`[run] Run stage exited with code ${code}.\n`);
        await fail(
          RunJobStatus.FAILED,
          "RUN_FAILED",
          `Run stage exited with code ${code}.`,
        );
        return;
      }

      appendSystemLog("[run] Run stage completed successfully.\n");
      await flush.flushNow();
      await updateJob(prisma, jobId, {
        status: RunJobStatus.SUCCEEDED,
        exitCode: code,
        errorCode: null,
        errorMessage: null,
        stdout: logs.getStdout(),
        stderr: logs.getStderr(),
        logStats: toJsonValue(logs.getStats()),
        finishedAt: new Date(),
        workDir: null,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "TIMEOUT") {
        await fail(
          RunJobStatus.TIMEOUT,
          "RUN_TIMEOUT",
          `Execution timed out after ${policy.run.timeoutMs} ms.`,
        );
      } else {
        await fail(RunJobStatus.FAILED, "DOCKER_RUN_FAILED", msg);
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await fail(RunJobStatus.FAILED, "ORCHESTRATOR_ERROR", msg);
  } finally {
    if (workDir) {
      await fs
        .rm(workDir, { recursive: true, force: true })
        .catch(() => undefined);
    }
    clearJobLogBuffer(jobId);
  }
}

export async function createJob(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  template: RunTemplateDto,
) {
  await assertWorkspaceMember(prisma, userId, workspaceId);

  const policy = resolveRunPolicy(template);
  const logStats = runLogStatsSchema.parse({
    maxBytes: policy.maxLogBytes,
    capturedBytes: 0,
    droppedBytes: 0,
    truncated: false,
  });

  const job = await prisma.runJob.create({
    data: {
      workspaceId,
      template: templateToPrisma[template],
      status: RunJobStatus.PENDING,
      runPolicy: toJsonValue(policy),
      logStats: toJsonValue(logStats),
    },
  });

  void runOrchestrator(prisma, job.id);

  return toRunJobPublicDto(job);
}

export async function getJobById(
  prisma: PrismaClient,
  id: string,
): Promise<RunJob | null> {
  return prisma.runJob.findUnique({ where: { id } });
}
