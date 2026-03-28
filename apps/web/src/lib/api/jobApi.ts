import {
  createRunJobBodySchema,
  createRunJobResponseSchema,
  getRunJobResponseSchema,
  runJobStreamDoneSchema,
  runJobStreamLogSchema,
  runJobStreamSnapshotSchema,
  type CreateRunJobBodyDto,
  type RunJobPublicDto,
  type RunLogEntryDto,
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
      errText
        ? `Rulare: ${res.status} — ${errText}`
        : `Rulare a eșuat (${res.status}).`,
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

export function subscribeRunJob(
  jobId: string,
  handlers: {
    onOpen?: () => void;
    onSnapshot?: (job: RunJobPublicDto) => void;
    onLog?: (entry: RunLogEntryDto) => void;
    onDone?: (job: RunJobPublicDto) => void;
    onError?: () => void;
  },
): () => void {
  const source = new EventSource(
    joinUrl(`/jobs/${encodeURIComponent(jobId)}/stream`),
    {
      withCredentials: true,
    },
  );

  source.onopen = () => {
    handlers.onOpen?.();
  };

  source.addEventListener("snapshot", (event) => {
    const payload: unknown = JSON.parse((event as MessageEvent<string>).data);
    const parsed = runJobStreamSnapshotSchema.parse(payload);
    handlers.onSnapshot?.(parsed.job);
  });

  source.addEventListener("log", (event) => {
    const payload: unknown = JSON.parse((event as MessageEvent<string>).data);
    const parsed = runJobStreamLogSchema.parse(payload);
    handlers.onLog?.(parsed.entry);
  });

  source.addEventListener("done", (event) => {
    const payload: unknown = JSON.parse((event as MessageEvent<string>).data);
    const parsed = runJobStreamDoneSchema.parse(payload);
    handlers.onDone?.(parsed.job);
  });

  source.onerror = () => {
    handlers.onError?.();
  };

  return () => {
    source.close();
  };
}
