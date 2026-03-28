import { useEffect, useState } from "react";
import type {
  AwarenessInstance,
  CollabPeerView,
  PresenceKind,
} from "../../lib/collab/awarenessTypes.js";
import { parseAwarenessState } from "../../lib/collab/awarenessTypes.js";
import { colorForClientId } from "../../lib/collab/collabColors.js";

function buildPeers(awareness: AwarenessInstance): CollabPeerView[] {
  const out: CollabPeerView[] = [];
  awareness.getStates().forEach((state, clientId) => {
    if (state == null) return;
    const s = parseAwarenessState(state);
    const kind: PresenceKind =
      s.presenceKind === "ai" ? "ai" : "human";
    const name =
      typeof s.user?.name === "string" && s.user.name.length > 0
        ? s.user.name
        : `Guest ${clientId}`;
    const color =
      typeof s.user?.color === "string" && s.user.color.length > 0
        ? s.user.color
        : colorForClientId(clientId);
    const activeFile =
      "activeFile" in s
        ? typeof s.activeFile === "string"
          ? s.activeFile
          : null
        : null;
    out.push({
      clientId,
      name,
      color,
      activeFile,
      isSelf: clientId === awareness.clientID,
      kind,
    });
  });
  out.sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

export function useCollabPresencePeers(
  awareness: AwarenessInstance | undefined,
): CollabPeerView[] {
  const [peers, setPeers] = useState<CollabPeerView[]>(() =>
    awareness ? buildPeers(awareness) : [],
  );

  useEffect(() => {
    if (!awareness) {
      setPeers([]);
      return;
    }
    const tick = (): void => {
      setPeers(buildPeers(awareness));
    };
    tick();
    awareness.on("change", tick);
    return () => {
      awareness.off("change", tick);
    };
  }, [awareness]);

  return peers;
}
