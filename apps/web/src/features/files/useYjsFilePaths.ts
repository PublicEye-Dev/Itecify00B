import { useEffect, useState } from "react";
import * as Y from "yjs";

/**
 * Abonează-te la cheile unui `Y.Map` (căi de fișiere) și returnează lista ordonată.
 * Fără acest hook, React nu re-randează la create/rename/delete.
 */
export function useYjsFilePaths(files: Y.Map<Y.Text>): string[] {
  const [paths, setPaths] = useState<string[]>(() => sortPaths(files));

  useEffect(() => {
    const tick = (): void => {
      setPaths(sortPaths(files));
    };
    tick();
    files.observe(tick);
    return () => {
      files.unobserve(tick);
    };
  }, [files]);

  return paths;
}

function sortPaths(files: Y.Map<Y.Text>): string[] {
  return Array.from(files.keys()).sort((a, b) => a.localeCompare(b));
}
