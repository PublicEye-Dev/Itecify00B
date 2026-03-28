import type { RunJob } from "@prisma/client";
import { runJobPublicSchema, type RunJobPublicDto } from "@itecify/shared/runner";

export function toRunJobPublicDto(job: RunJob): RunJobPublicDto {
  return runJobPublicSchema.parse({
    id: job.id,
    workspaceId: job.workspaceId,
    template: job.template,
    status: job.status,
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
