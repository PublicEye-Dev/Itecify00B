import * as Y from "yjs";
import { encodeStateAsUpdate } from "yjs";
import { WORKSPACE_FILES_MAP_KEY } from "@itecify/shared/collab";
import type { RunTemplate } from "@prisma/client";
import type { WorkspaceSnapshotV1 } from "@itecify/shared/collab";

const STARTER_FILES: Record<RunTemplate, Record<string, string>> = {
  javascript: {
    "main.js": `console.log("Hello from iTECify (JavaScript)");\n`,
  },
  python: {
    "main.py": `print("Hello from iTECify (Python)")\n`,
  },
  java: {
    "Main.java": `public class Main {
  public static void main(String[] args) {
    System.out.println("Hello from iTECify (Java)");
  }
}
`,
  },
  c: {
    "main.c": `#include <stdio.h>

int main(void) {
  puts("Hello from iTECify (C)");
  return 0;
}
`,
  },
};

/** Construiește un snapshot Yjs inițial compatibil cu `WorkspaceSnapshotV1`. */
export function buildTemplateInitialSnapshot(
  template: RunTemplate,
): WorkspaceSnapshotV1 {
  const ydoc = new Y.Doc();
  const files = ydoc.getMap<Y.Text>(WORKSPACE_FILES_MAP_KEY);
  const starter = STARTER_FILES[template];

  ydoc.transact(() => {
    for (const [path, content] of Object.entries(starter)) {
      const t = new Y.Text();
      if (content.length > 0) {
        t.insert(0, content);
      }
      files.set(path, t);
    }
  });

  const update = encodeStateAsUpdate(ydoc);
  return {
    version: 1,
    update: Array.from(update),
  };
}
