import { z } from "zod";
import { runTemplateSchema } from "../runner/schemas.js";

export const workspaceTemplateSchema = runTemplateSchema;
export type WorkspaceTemplateDto = z.infer<typeof workspaceTemplateSchema>;

export const createWorkspaceBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  template: workspaceTemplateSchema,
});
export type CreateWorkspaceBodyDto = z.infer<typeof createWorkspaceBodySchema>;

export const joinWorkspaceBodySchema = z.object({
  shareToken: z.string().trim().min(8).max(128),
});
export type JoinWorkspaceBodyDto = z.infer<typeof joinWorkspaceBodySchema>;

export const workspaceMemberRoleSchema = z.enum(["OWNER", "EDITOR"]);
export type WorkspaceMemberRoleDto = z.infer<typeof workspaceMemberRoleSchema>;

export const workspacePublicSchema = z.object({
  id: z.string(),
  name: z.string(),
  template: workspaceTemplateSchema,
  shareToken: z.string(),
  ownerId: z.string(),
  role: workspaceMemberRoleSchema,
  snapshotUpdatedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});
export type WorkspacePublicDto = z.infer<typeof workspacePublicSchema>;

export const workspaceListResponseSchema = z.object({
  workspaces: z.array(workspacePublicSchema),
});

export const workspaceDetailResponseSchema = z.object({
  workspace: workspacePublicSchema,
});

export const createWorkspaceResponseSchema = z.object({
  workspace: workspacePublicSchema,
});

export const joinWorkspaceResponseSchema = z.object({
  workspace: workspacePublicSchema,
});
