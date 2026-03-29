/**
 * Resetare document Yjs pentru un room (workspaceId) — folosit la „restaurează checkpoint”.
 * Folosește API-ul exportat de `y-websocket/bin/utils` (`docs`, `getYDoc`).
 */
import { createRequire } from "node:module";
import type * as Y from "yjs";

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Yjs = require("yjs") as typeof Y;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const utils = require("y-websocket/bin/utils") as {
  docs: Map<string, { conns: Map<unknown, unknown>; destroy: () => void }>;
  getYDoc: (docName: string, gc?: boolean) => Y.Doc;
};

export function restoreYjsRoomFromUpdate(
  docName: string,
  update: Uint8Array,
): void {
  const existing = utils.docs.get(docName);
  if (existing) {
    for (const conn of Array.from(existing.conns.keys())) {
      try {
        (conn as { close: () => void }).close();
      } catch {
        /* ignore */
      }
    }
    existing.destroy();
    utils.docs.delete(docName);
  }
  const doc = utils.getYDoc(docName, true);
  Yjs.applyUpdate(doc, update);
}
