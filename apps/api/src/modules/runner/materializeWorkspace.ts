import * as fs from "node:fs/promises";
import path from "node:path";
import * as Y from "yjs";
import { applyUpdate } from "yjs";
import { WORKSPACE_FILES_MAP_KEY } from "@itecify/shared/collab";
import { isSafeRelativeWorkspacePath } from "./safePath.js";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export async function materializeYjsSnapshotToDir(
  snapshotBytes: Uint8Array | undefined,
  targetDir: string,
): Promise<{ fileCount: number }> {
  const ydoc = new Y.Doc();
  if (snapshotBytes && snapshotBytes.length > 0) {
    applyUpdate(ydoc, snapshotBytes);
  }

  const files = ydoc.getMap<Y.Text>(WORKSPACE_FILES_MAP_KEY);
  await fs.mkdir(targetDir, { recursive: true });

  let fileCount = 0;
  for (const [relPath, ytext] of files.entries()) {
    if (typeof relPath !== "string" || !ytext) continue;
    if (!isSafeRelativeWorkspacePath(relPath)) continue;

    const full = path.join(targetDir, relPath.split("/").join(path.sep));
    const resolved = path.resolve(full);
    const root = path.resolve(targetDir);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      continue;
    }

    const content = ytext.toString();
    const buf = Buffer.from(content, "utf8");
    if (buf.length > MAX_FILE_BYTES) continue;

    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, buf, "utf8");
    fileCount += 1;
  }

  return { fileCount };
}
