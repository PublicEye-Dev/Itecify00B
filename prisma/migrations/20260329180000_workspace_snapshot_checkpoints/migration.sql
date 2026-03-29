-- CreateEnum
CREATE TYPE "SnapshotCheckpointKind" AS ENUM ('AUTOSAVE', 'PRE_RUN', 'AI_ACCEPTED');

-- CreateTable
CREATE TABLE "workspace_snapshot_checkpoints" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "kind" "SnapshotCheckpointKind" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_snapshot_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_snapshot_checkpoints_workspace_id_created_at_idx" ON "workspace_snapshot_checkpoints"("workspace_id", "created_at");

-- AddForeignKey
ALTER TABLE "workspace_snapshot_checkpoints" ADD CONSTRAINT "workspace_snapshot_checkpoints_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
