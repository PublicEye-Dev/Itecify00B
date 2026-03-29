import { isWorkspaceSnapshotV1 } from "@itecify/shared/collab";
import { resolveApiBaseUrl } from "../api/client.js";

function apiBase(): string {
  return resolveApiBaseUrl();
}

function snapshotUrl(workspaceId: string): string {
  const base = apiBase().replace(/\/$/, "");
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/snapshot`;
  return base ? `${base}${path}` : path;
}

/**
 * Încarcă ultimul snapshot persistat de API (dacă există).
 * 404 = nimic stocat — clientul face bootstrap local.
 */
export async function fetchWorkspaceSnapshotUpdate(
  workspaceId: string,
): Promise<Uint8Array | null> {
  const url = snapshotUrl(workspaceId);
  try {
    const res = await fetch(url, {
      credentials: "include",
    });
    if (!res.ok) return null;
    const raw: unknown = await res.json();
    if (!isWorkspaceSnapshotV1(raw)) return null;
    if (raw.update.length === 0) return null;
    return new Uint8Array(raw.update);
  } catch {
    return null;
  }
}

export async function persistWorkspaceSnapshot(
  workspaceId: string,
  update: Uint8Array,
): Promise<void> {
  const url = snapshotUrl(workspaceId);
  try {
    const res = await fetch(url, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1 as const, update: Array.from(update) }),
    });
    if (
      !res.ok &&
      typeof import.meta.env !== "undefined" &&
      import.meta.env.DEV
    ) {
      console.warn(
        `[itecify] Snapshot PUT nu a reușit (${res.status}) pentru workspace ${workspaceId}.`,
      );
    }
  } catch {
    /* best-effort; collab live rămâne sursa de adevăr */
  }
}

/** Persistă înainte de runner ca Docker să vadă ultima stare din editor. */
export async function persistWorkspaceSnapshotBlocking(
  workspaceId: string,
  update: Uint8Array,
): Promise<void> {
  const url = snapshotUrl(workspaceId);
  const res = await fetch(url, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: 1 as const, update: Array.from(update) }),
  });
  if (!res.ok) {
    throw new Error(
      `Nu am putut salva snapshot-ul înainte de rulare (${res.status}).`,
    );
  }
}
