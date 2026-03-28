/**
 * Chei și tipuri partajate pentru documentul Yjs pe workspace.
 * Forma documentului: un singur Y.Doc per conexiune; conținutul fișierelor
 * stă într-un Y.Map unde valoarea este Y.Text (nu string brut).
 */
export const WORKSPACE_FILES_MAP_KEY = "files";

export const WORKSPACE_SNAPSHOT_VERSION = 1 as const;

/** Update binar Yjs (`encodeStateAsUpdate`) serializat pentru JSON transport. */
export type WorkspaceSnapshotV1 = {
  version: typeof WORKSPACE_SNAPSHOT_VERSION;
  update: number[];
};

export function isWorkspaceSnapshotV1(v: unknown): v is WorkspaceSnapshotV1 {
  if (!v || typeof v !== "object") return false;
  const o = v as WorkspaceSnapshotV1;
  return (
    o.version === WORKSPACE_SNAPSHOT_VERSION &&
    Array.isArray(o.update) &&
    o.update.every((n) => typeof n === "number")
  );
}
