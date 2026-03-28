import {
  createWorkspaceBodySchema,
  createWorkspaceResponseSchema,
  joinWorkspaceBodySchema,
  joinWorkspaceResponseSchema,
  workspaceDetailResponseSchema,
  workspaceListResponseSchema,
  type CreateWorkspaceBodyDto,
  type JoinWorkspaceBodyDto,
} from "@itecify/shared/workspaces";
import { resolveApiBaseUrl } from "./client.js";

function joinUrl(path: string): string {
  const base = resolveApiBaseUrl().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(joinUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });
}

export async function listWorkspaces() {
  const res = await authFetch("/workspaces");
  if (!res.ok) throw new Error(`listWorkspaces: ${res.status}`);
  const json: unknown = await res.json();
  return workspaceListResponseSchema.parse(json);
}

export async function createWorkspace(body: CreateWorkspaceBodyDto) {
  const parsed = createWorkspaceBodySchema.parse(body);
  const res = await authFetch("/workspaces", {
    method: "POST",
    body: JSON.stringify(parsed),
  });
  if (!res.ok) throw new Error(`createWorkspace: ${res.status}`);
  const json: unknown = await res.json();
  return createWorkspaceResponseSchema.parse(json);
}

export async function getWorkspace(workspaceId: string) {
  const res = await authFetch(
    `/workspaces/${encodeURIComponent(workspaceId)}`,
  );
  if (!res.ok) throw new Error(`getWorkspace: ${res.status}`);
  const json: unknown = await res.json();
  return workspaceDetailResponseSchema.parse(json);
}

export async function joinWorkspace(body: JoinWorkspaceBodyDto) {
  const parsed = joinWorkspaceBodySchema.parse(body);
  const res = await authFetch("/workspaces/join", {
    method: "POST",
    body: JSON.stringify(parsed),
  });
  if (!res.ok) throw new Error(`joinWorkspace: ${res.status}`);
  const json: unknown = await res.json();
  return joinWorkspaceResponseSchema.parse(json);
}
