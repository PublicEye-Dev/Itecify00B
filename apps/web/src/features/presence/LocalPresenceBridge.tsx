import { useEffect, type ReactNode } from "react";
import type { AwarenessInstance } from "../../lib/collab/awarenessTypes.js";
import { colorForClientId } from "../../lib/collab/collabColors.js";

/**
 * Sincronizează câmpuri awareness (user, fișier activ) fără a înlocui `selection` din y-monaco.
 */
export function LocalPresenceBridge({
  awareness,
  displayName,
  activeFile,
}: {
  awareness: AwarenessInstance;
  displayName: string;
  activeFile: string | null;
}): ReactNode {
  useEffect(() => {
    const color = colorForClientId(awareness.clientID);
    awareness.setLocalStateField("user", {
      name: displayName,
      color,
    });
    awareness.setLocalStateField("presenceKind", "human");
  }, [awareness, displayName]);

  useEffect(() => {
    awareness.setLocalStateField("activeFile", activeFile);
  }, [awareness, activeFile]);

  return null;
}
