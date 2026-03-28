import * as fs from "node:fs/promises";
import * as fssync from "node:fs";
import * as os from "node:os";
import path from "node:path";
import process from "node:process";
import type { PrismaClient } from "@prisma/client";
import { RunJobStatus, RunTemplate, type RunJob } from "@prisma/client";
import type { RunTemplateDto } from "@itecify/shared/runner";
import { getSnapshotBytesForWorkspace } from "../snapshots/snapshot.service.js";
import { runInDocker } from "../runner/dockerRunner.js";
import { clearJobLogBuffer, emitJobLog } from "../runner/jobLogBus.js";
import { materializeYjsSnapshotToDir } from "../runner/materializeWorkspace.js";
import { getRecipe } from "../runtime-templates/recipes.js";
import { assertWorkspaceMember } from "../workspaces/workspace.service.js";
import { toRunJobPublicDto } from "./job.mapper.js";

const TERMINAL: RunJobStatus[] = [
  RunJobStatus.SUCCEEDED,
  RunJobStatus.FAILED,
  RunJobStatus.TIMEOUT,
  RunJobStatus.CANCELLED,
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

function debounceFlush(
  jobId: string,
  prisma: PrismaClient,
  getStdout: () => string,
  getStderr: () => string,
): () => void {
  let t: NodeJS.Timeout | null = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      void prisma.runJob.update({
        where: { id: jobId },
        data: { stdout: getStdout(), stderr: getStderr() },
      });
    }, 400);
  };
}

async function runOrchestrator(prisma: PrismaClient, jobId: string): Promise<void> {
  let workDir: string | null = null;
  let stdoutAcc = "";
  let stderrAcc = "";

  const fail = async (status: RunJobStatus, errorCode: string, message: string): Promise<void> => {
    await prisma.runJob.update({
      where: { id: jobId },
      data: {
        status,
        errorCode,
        errorMessage: message,
        stdout: stdoutAcc,
        stderr: stderrAcc,
        finishedAt: new Date(),
        workDir: null,
      },
    });
  };

  try {
    const job = await prisma.runJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    workDir = workRootFor(jobId);
    await fs.mkdir(workDir, { recursive: true });

    await prisma.runJob.update({
      where: { id: jobId },
      data: {
        status: RunJobStatus.MATERIALIZING,
        workDir,
        startedAt: new Date(),
      },
    });

    const snapshot = await getSnapshotBytesForWorkspace(prisma, job.workspaceId);
    const { fileCount } = await materializeYjsSnapshotToDir(snapshot, workDir);

    if (fileCount === 0 && (!snapshot || snapshot.length === 0)) {
      await fail(RunJobStatus.FAILED, "EMPTY_WORKSPACE", "Snapshot lipsă sau workspace fără fișiere.");
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

    await prisma.runJob.update({
      where: { id: jobId },
      data: { status: RunJobStatus.RUNNING },
    });

    const scheduleFlush = debounceFlush(jobId, prisma, () => stdoutAcc, () => stderrAcc);
    const label = `itecify.job.id=${jobId}`;

    try {
      const timeoutMs = Number(process.env.RUNNER_TIMEOUT_MS ?? "60000");

      const result = await runInDocker({
        workDirHost: workDir,
        image: recipe.dockerImage,
        shellScript: recipe.shellScript,
        label,
        timeoutMs,
        onStdout: (chunk) => {
          stdoutAcc += chunk;
          emitJobLog(jobId, { stream: "stdout", chunk });
          scheduleFlush();
        },
        onStderr: (chunk) => {
          stderrAcc += chunk;
          emitJobLog(jobId, { stream: "stderr", chunk });
          scheduleFlush();
        },
      });

      const code = result.exitCode ?? 1;
      await prisma.runJob.update({
        where: { id: jobId },
        data: {
          status: code === 0 ? RunJobStatus.SUCCEEDED : RunJobStatus.FAILED,
          exitCode: code,
          errorCode: code === 0 ? null : "NONZERO_EXIT",
          errorMessage: code === 0 ? null : `Procesul s-a încheiat cu codul ${code}.`,
          stdout: stdoutAcc,
          stderr: stderrAcc,
          finishedAt: new Date(),
          workDir: null,
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "TIMEOUT") {
        await fail(
          RunJobStatus.TIMEOUT,
          "TIMEOUT",
          `Execuție oprită după ${process.env.RUNNER_TIMEOUT_MS ?? "60000"} ms.`,
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
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
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

  const job = await prisma.runJob.create({
    data: {
      workspaceId,
      template: templateToPrisma[template],
      status: RunJobStatus.PENDING,
    },
  });

  void runOrchestrator(prisma, job.id);

  return toRunJobPublicDto(job);
}

export async function getJobById(prisma: PrismaClient, id: string): Promise<RunJob | null> {
  return prisma.runJob.findUnique({ where: { id } });
}
