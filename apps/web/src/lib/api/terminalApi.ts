import {
  terminalEnsureSandboxResponseSchema,
  terminalSandboxStatusSchema,
} from "@itecify/shared/terminal";
import { resolveApiBaseUrl } from "./client.js";

function joinUrl(path: string): string {
  const base = resolveApiBaseUrl().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/** Baza API ca WebSocket (`ws:` / `wss:`), același host ca pagina în dev (proxy Vite). */
export function resolveApiWsBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL;
  if (typeof configured === "string" && configured.trim().length > 0) {
    const base = configured.replace(/\/$/, "");
    if (base.startsWith("https://")) {
      return `wss://${base.slice("https://".length)}`;
    }
    if (base.startsWith("http://")) {
      return `ws://${base.slice("http://".length)}`;
    }
    return base;
  }
  if (import.meta.env.DEV && typeof window !== "undefined") {
    const { protocol, host } = window.location;
    return protocol === "https:" ? `wss://${host}` : `ws://${host}`;
  }
  const base = resolveApiBaseUrl().replace(/\/$/, "");
  if (base.startsWith("https://")) {
    return `wss://${base.slice("https://".length)}`;
  }
  if (base.startsWith("http://")) {
    return `ws://${base.slice("http://".length)}`;
  }
  return base;
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

export async function getTerminalSandboxStatus(workspaceId: string) {
  const res = await authFetch(
    `/workspaces/${encodeURIComponent(workspaceId)}/terminal/status`,
    { method: "GET" },
  );
  if (!res.ok) {
    throw new Error(`Terminal status: ${res.status}`);
  }
  const json: unknown = await res.json();
  return terminalSandboxStatusSchema.parse(json);
}

export async function ensureTerminalSandbox(workspaceId: string) {
  /** Fastify: cu `Content-Type: application/json` corpul nu poate fi gol — `authFetch` setează mereu headerul. */
  const res = await authFetch(
    `/workspaces/${encodeURIComponent(workspaceId)}/terminal/sandbox`,
    { method: "POST", body: "{}" },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      text ? `Sandbox: ${res.status} — ${text}` : `Sandbox (${res.status}).`,
    );
  }
  const json: unknown = await res.json();
  return terminalEnsureSandboxResponseSchema.parse(json);
}

export function terminalStreamWsUrl(workspaceId: string): string {
  const base = resolveApiWsBaseUrl().replace(/\/$/, "");
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/terminal/stream`;
  return `${base}${path}`;
}
