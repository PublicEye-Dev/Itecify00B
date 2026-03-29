import { isWorkspaceSnapshotV1 } from "@itecify/shared/collab";
import type { SnapshotCheckpointKindDto } from "@itecify/shared/replay";
import {
  checkpointListResponseSchema,
  recordCheckpointApiResponseSchema,
  restoreCheckpointResponseSchema,
} from "@itecify/shared/replay";
import { apiErrorSchema } from "@itecify/shared/auth";
import {
  clearExpiredAutosaveSuppress,
  isAutosavePersistSuppressed,
  suppressAutosavePersistForMs,
} from "./autosaveSuppress.js";
import { resolveApiBaseUrl } from "../api/client.js";

export {
  isAutosavePersistSuppressed,
  suppressAutosavePersistForMs,
} from "./autosaveSuppress.js";

async function readJsonFromResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

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
  clearExpiredAutosaveSuppress();
  if (isAutosavePersistSuppressed()) {
    return;
  }
  const base = apiBase();
  if (!base) return;
  const url = `${base}/workspaces/${encodeURIComponent(workspaceId)}/snapshot`;
  const payload = {
    version: 1 as const,
    update: Array.from(update),
  };
  try {
    const res = await fetch(url, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
    if (res.ok) {
      /* Cursă: flush-ul debounced a pornit PUT înainte de „Salvează checkpoint” / suppress.
       * La întoarcerea răspunsului, trebuie să respectăm suprimarea curentă, altfel apare
       * un AUTOSAVE duplicat lângă MANUAL_SAVE (același snapshot). */
      clearExpiredAutosaveSuppress();
      if (isAutosavePersistSuppressed()) {
        return;
      }
      void recordSnapshotCheckpoint(workspaceId, "AUTOSAVE", payload).then(
        (ok) => {
          if (!ok && import.meta.env.DEV) {
            console.warn(
              `[itecify:checkpoint] AUTOSAVE nu s-a înregistrat (HTTP) workspace=${workspaceId}`,
            );
          }
        },
      );
    }
  } catch {
    /* best-effort; collab live rămâne sursa de adevăr */
  }
}

/**
 * PUT snapshot canonic + checkpoint MANUAL_SAVE. Folosit la butonul „Salvează checkpoint”.
 * Suprimă temporar autosave-ul pentru a evita curse cu flush-ul debounced din provider.
 */
export async function saveManualCheckpointToHistory(
  workspaceId: string,
  update: Uint8Array,
): Promise<{ checkpointId: string }> {
  clearExpiredAutosaveSuppress();
  suppressAutosavePersistForMs(2500);

  const base = apiBase();
  if (!base) {
    throw new Error("VITE_API_URL / API indisponibil.");
  }
  const payload = {
    version: 1 as const,
    update: Array.from(update),
  };
  const putUrl = `${base}/workspaces/${encodeURIComponent(workspaceId)}/snapshot`;
  const putRes = await fetch(putUrl, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!putRes.ok) {
    const errPayload = await readJsonFromResponse(putRes);
    const apiErr = errPayload ? apiErrorSchema.safeParse(errPayload) : null;
    throw new Error(
      apiErr?.success
        ? apiErr.data.message
        : `Nu am putut salva snapshot-ul (${putRes.status}).`,
    );
  }

  const postUrl = `${base}/workspaces/${encodeURIComponent(workspaceId)}/snapshot/checkpoints`;
  const postRes = await fetch(postUrl, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "MANUAL_SAVE" as const, snapshot: payload }),
  });
  const postBody = await readJsonFromResponse(postRes);
  if (!postRes.ok) {
    const apiErr = postBody ? apiErrorSchema.safeParse(postBody) : null;
    throw new Error(
      apiErr?.success
        ? apiErr.data.message
        : `Checkpoint manual respins (${postRes.status}).`,
    );
  }
  const parsed = recordCheckpointApiResponseSchema.safeParse(postBody);
  if (!parsed.success || !parsed.data.recorded || !("id" in parsed.data)) {
    throw new Error(
      "Răspuns API neașteptat la salvarea checkpoint-ului manual.",
    );
  }
  return { checkpointId: parsed.data.id };
}

/** Persistă înainte de runner ca Docker să vadă ultima stare din editor. */
export async function persistWorkspaceSnapshotBlocking(
  workspaceId: string,
  update: Uint8Array,
): Promise<void> {
  const base = apiBase();
  if (!base) {
    throw new Error("VITE_API_URL / API indisponibil.");
  }
  const url = `${base}/workspaces/${encodeURIComponent(workspaceId)}/snapshot`;
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
  const payload = {
    version: 1 as const,
    update: Array.from(update),
  };
  const checkpointOk = await recordSnapshotCheckpoint(
    workspaceId,
    "PRE_RUN",
    payload,
  );
  if (!checkpointOk) {
    throw new Error(
      "Checkpoint-ul PRE_RUN nu a putut fi salvat în istoric (API). Verifică migrarea Prisma și logurile serverului.",
    );
  }
}

async function recordSnapshotCheckpoint(
  workspaceId: string,
  kind: SnapshotCheckpointKindDto,
  snapshot: { version: 1; update: number[] },
): Promise<boolean> {
  const base = apiBase();
  if (!base) return false;
  const url = `${base}/workspaces/${encodeURIComponent(workspaceId)}/snapshot/checkpoints`;
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, snapshot }),
    });
    if (import.meta.env.DEV) {
      console.debug("[itecify:checkpoint]", {
        workspaceId,
        kind,
        ok: res.ok,
        status: res.status,
      });
    }
    return res.ok;
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("[itecify:checkpoint] fetch failed", { workspaceId, kind, e });
    }
    return false;
  }
}

/** Înregistrează explicit un checkpoint (ex. după accept AI). */
export async function recordSnapshotCheckpointExplicit(
  workspaceId: string,
  kind: SnapshotCheckpointKindDto,
  update: Uint8Array,
): Promise<boolean> {
  return recordSnapshotCheckpoint(workspaceId, kind, {
    version: 1,
    update: Array.from(update),
  });
}

export async function fetchSnapshotCheckpoints(
  workspaceId: string,
): Promise<{ id: string; kind: SnapshotCheckpointKindDto; createdAt: Date }[]> {
  const base = apiBase();
  if (!base) return [];
  const url = `${base}/workspaces/${encodeURIComponent(workspaceId)}/snapshot/checkpoints`;
  const res = await fetch(url, { credentials: "include" });
  const payload = await readJsonFromResponse(res);

  if (res.status === 401 || res.status === 403) {
    const apiErr = payload ? apiErrorSchema.safeParse(payload) : null;
    throw new Error(
      apiErr?.success
        ? apiErr.data.message
        : "Nu ești autentificat sau nu ai acces la acest workspace.",
    );
  }

  if (!res.ok) {
    const apiErr = payload ? apiErrorSchema.safeParse(payload) : null;
    const fromServer = apiErr?.success ? apiErr.data.message : null;
    if (fromServer) {
      throw new Error(fromServer);
    }
    if (res.status === 404) {
      throw new Error(
        "Resursă negăsită (404). Verifică ID-ul workspace-ului sau că ruta API există pe server.",
      );
    }
    throw new Error(
      `Istoric indisponibil (HTTP ${res.status}). Verifică logurile API și migrarea Prisma.`,
    );
  }

  const parsed = checkpointListResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      "Răspuns API neașteptat la lista de checkpoint-uri (schema invalidă).",
    );
  }
  return parsed.data.checkpoints;
}

export async function fetchCheckpointSnapshotJson(
  workspaceId: string,
  checkpointId: string,
): Promise<{ version: 1; update: number[] } | null> {
  const base = apiBase();
  if (!base) return null;
  const url = `${base}/workspaces/${encodeURIComponent(workspaceId)}/snapshot/checkpoints/${encodeURIComponent(checkpointId)}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  const raw: unknown = await res.json();
  return isWorkspaceSnapshotV1(raw) ? raw : null;
}

export async function restoreSnapshotCheckpoint(
  workspaceId: string,
  checkpointId: string,
): Promise<{ liveStateAligned: true }> {
  const base = apiBase();
  if (!base) {
    throw new Error("API indisponibil.");
  }
  const url = `${base}/workspaces/${encodeURIComponent(workspaceId)}/snapshot/checkpoints/${encodeURIComponent(checkpointId)}/restore`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
  });
  const payload = await readJsonFromResponse(res);
  if (!res.ok) {
    const apiErr = payload ? apiErrorSchema.safeParse(payload) : null;
    const fromServer = apiErr?.success ? apiErr.data.message : null;
    throw new Error(
      fromServer ??
        `Restaurare eșuată (HTTP ${res.status}). Verifică API, collab și variabilele COLLAB_HTTP_URL / COLLAB_ROOM_RESTORE_SECRET.`,
    );
  }
  const parsed = restoreCheckpointResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Răspuns API invalid la restaurare.");
  }
  return { liveStateAligned: parsed.data.liveStateAligned };
}
