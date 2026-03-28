import * as Y from "yjs";
import { WORKSPACE_FILES_MAP_KEY } from "@itecify/shared/collab";

export function getWorkspaceFilesMap(ydoc: Y.Doc): Y.Map<Y.Text> {
  return ydoc.getMap<Y.Text>(WORKSPACE_FILES_MAP_KEY);
}

/**
 * Dacă documentul e gol (primul deschidere, fără snapshot), creează un README.
 * Nu suprascrie nimic dacă map-ul are deja intrări (snapshot sau alt client).
 */
export function bootstrapWorkspaceIfEmpty(ydoc: Y.Doc): void {
  const files = getWorkspaceFilesMap(ydoc);
  if (files.size > 0) return;
  ydoc.transact(() => {
    const welcome = new Y.Text("# iTECify\n\nWorkspace colaborativ. Adaugă fișiere din stânga.\n");
    files.set("README.md", welcome);
  });
}
