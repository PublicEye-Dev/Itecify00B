import { z } from "zod";
import {
  isWorkspaceSnapshotV1,
  type WorkspaceSnapshotV1,
} from "../collab/index.js";

export const snapshotCheckpointKindSchema = z.enum([
  "AUTOSAVE",
  "PRE_RUN",
  "AI_ACCEPTED",
  "MANUAL_SAVE",
]);

export type SnapshotCheckpointKindDto = z.infer<
  typeof snapshotCheckpointKindSchema
>;

export const checkpointMetaSchema = z.object({
  id: z.string(),
  kind: snapshotCheckpointKindSchema,
  createdAt: z.coerce.date(),
});

export type CheckpointMetaDto = z.infer<typeof checkpointMetaSchema>;

export const checkpointListResponseSchema = z.object({
  checkpoints: z.array(checkpointMetaSchema),
});

export type CheckpointListResponseDto = z.infer<
  typeof checkpointListResponseSchema
>;

export const recordCheckpointBodySchema = z.object({
  kind: snapshotCheckpointKindSchema,
  snapshot: z
    .unknown()
    .refine(
      (v): v is WorkspaceSnapshotV1 => isWorkspaceSnapshotV1(v),
      "Invalid workspace snapshot payload.",
    ),
});

export type RecordCheckpointBodyDto = z.infer<
  typeof recordCheckpointBodySchema
>;

/** După restore reușit, starea live Yjs (room collab) e aliniată cu snapshot-ul canonic. */
export const restoreCheckpointResponseSchema = z.object({
  ok: z.literal(true),
  liveStateAligned: z.literal(true),
});

export type RestoreCheckpointResponseDto = z.infer<
  typeof restoreCheckpointResponseSchema
>;

/** Răspuns POST `/snapshot/checkpoints` (înregistrare punct în istoric). */
export const recordCheckpointApiResponseSchema = z.discriminatedUnion(
  "recorded",
  [
    z.object({
      ok: z.literal(true),
      recorded: z.literal(true),
      id: z.string(),
    }),
    z.object({
      ok: z.literal(true),
      recorded: z.literal(false),
    }),
  ],
);

export type RecordCheckpointApiResponseDto = z.infer<
  typeof recordCheckpointApiResponseSchema
>;
