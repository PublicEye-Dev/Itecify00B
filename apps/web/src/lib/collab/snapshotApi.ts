import { isWorkspaceSnapshotV1 } from "@itecify/shared/collab";
import { resolveApiBaseUrl } from "../api/client.js";

function apiBase(): string {
  return resolveApiBaseUrl();
}

/**
 * Încarcă ultimul snapshot persistat de API (dacă există).
 * 404 = nimic stocat — clientul face bootstrap local.
 */
export async function fetchWorkspaceSnapshotUpdate(
  workspaceId: string,
): Promise<Uint8Array | null> {
  const base = apiBase();
  if (!base) return null;
  const url = `${base}/workspaces/${encodeURIComponent(workspaceId)}/snapshot`;
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
  const base = apiBase();
  if (!base) return;
  const url = `${base}/workspaces/${encodeURIComponent(workspaceId)}/snapshot`;
  try {
    await fetch(url, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1 as const, update: Array.from(update) }),
    });
  } catch {
    /* best-effort; collab live rămâne sursa de adevăr */
  }
}
