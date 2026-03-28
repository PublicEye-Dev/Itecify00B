import * as Y from "yjs";
import { getWorkspaceFilesMap } from "../../lib/collab/workspaceDoc.js";

function nextUntitledPath(files: Y.Map<Y.Text>): string {
  let n = 0;
  let name = "untitled.ts";
  while (files.has(name)) {
    n += 1;
    name = `untitled-${n}.ts`;
  }
  return name;
}

export function createUntitledFile(ydoc: Y.Doc): string {
  const files = getWorkspaceFilesMap(ydoc);
  const path = nextUntitledPath(files);
  ydoc.transact(() => {
    files.set(path, new Y.Text(""));
  });
  return path;
}

export function deleteFile(ydoc: Y.Doc, path: string): void {
  const files = getWorkspaceFilesMap(ydoc);
  ydoc.transact(() => {
    files.delete(path);
  });
}

export function renameFile(ydoc: Y.Doc, from: string, to: string): boolean {
  const next = to.trim();
  if (!next || next.includes("..") || from === next) return false;
  const files = getWorkspaceFilesMap(ydoc);
  if (files.has(next)) return false;
  const existing = files.get(from);
  if (!existing) return false;

  ydoc.transact(() => {
    const content = existing.toString();
    files.delete(from);
    const ytext = new Y.Text();
    if (content.length > 0) {
      ytext.insert(0, content);
    }
    files.set(next, ytext);
  });
  return true;
}
