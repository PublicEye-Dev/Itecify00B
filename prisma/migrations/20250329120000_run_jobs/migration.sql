-- CreateEnum
CREATE TYPE "RunTemplate" AS ENUM ('javascript', 'python', 'java', 'c');

-- CreateEnum
CREATE TYPE "RunJobStatus" AS ENUM ('PENDING', 'MATERIALIZING', 'BUILDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMEOUT', 'CANCELLED');

-- CreateTable
CREATE TABLE "run_jobs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "template" "RunTemplate" NOT NULL,
    "status" "RunJobStatus" NOT NULL DEFAULT 'PENDING',
    "exit_code" INTEGER,
    "error_code" TEXT,
    "error_message" TEXT,
    "stdout" TEXT NOT NULL DEFAULT '',
    "stderr" TEXT NOT NULL DEFAULT '',
    "work_dir" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "run_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "run_jobs_workspace_id_idx" ON "run_jobs"("workspace_id");

-- CreateIndex
CREATE INDEX "run_jobs_status_idx" ON "run_jobs"("status");
