import {
  createRunJobBodySchema,
  createRunJobResponseSchema,
  getRunJobResponseSchema,
  type CreateRunJobBodyDto,
} from "@itecify/shared/runner";
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

export async function createRunJob(body: CreateRunJobBodyDto) {
  const parsed = createRunJobBodySchema.parse(body);
  const res = await authFetch("/jobs", {
    method: "POST",
    body: JSON.stringify(parsed),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      errText ? `Rulare: ${res.status} — ${errText}` : `Rulare a eșuat (${res.status}).`,
    );
  }
  const json: unknown = await res.json();
  return createRunJobResponseSchema.parse(json);
}

export async function getRunJob(jobId: string) {
  const res = await authFetch(`/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
  });
  if (!res.ok) {
    throw new Error(`Job ${jobId}: răspuns ${res.status}.`);
  }
  const json: unknown = await res.json();
  return getRunJobResponseSchema.parse(json);
}
