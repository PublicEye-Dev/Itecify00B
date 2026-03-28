import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { bootstrapWorkspaceIfEmpty, getWorkspaceFilesMap } from "./workspaceDoc.js";
import { fetchWorkspaceSnapshotUpdate, persistWorkspaceSnapshot } from "./snapshotApi.js";

type ReadyState = {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  files: Y.Map<Y.Text>;
};

const WorkspaceCollabContext = createContext<ReadyState | null>(null);

function resolveCollabWsUrl(): string {
  const u = import.meta.env.VITE_COLLAB_WS_URL;
  if (typeof u === "string" && u.length > 0) return u;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.hostname}:1234`;
}

export function WorkspaceCollabProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}): ReactNode {
  const [ready, setReady] = useState<ReadyState | null>(null);

  useEffect(() => {
    let cancelled = false;
    let provider: WebsocketProvider | null = null;
    const ydoc = new Y.Doc();

    void (async () => {
      const snapshot = await fetchWorkspaceSnapshotUpdate(workspaceId);
      if (cancelled) return;
      if (snapshot && snapshot.byteLength > 0) {
        Y.applyUpdate(ydoc, snapshot);
      }
      bootstrapWorkspaceIfEmpty(ydoc);
      if (cancelled) return;

      const ws = new WebsocketProvider(resolveCollabWsUrl(), workspaceId, ydoc, {
        connect: true,
      });
      provider = ws;

      if (cancelled) {
        ws.destroy();
        return;
      }

      setReady({
        ydoc,
        provider: ws,
        files: getWorkspaceFilesMap(ydoc),
      });
    })();

    return () => {
      cancelled = true;
      provider?.destroy();
      ydoc.destroy();
      setReady(null);
    };
  }, [workspaceId]);

  /**
   * Persistă starea completă Yjs după fiecare update remote/local, debounced.
   * Colaborarea live e oricum pegată la WebSocket; asta e doar „cold start”.
   */
  useEffect(() => {
    if (!ready) return;
    const { ydoc } = ready;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = (): void => {
      void persistWorkspaceSnapshot(workspaceId, Y.encodeStateAsUpdate(ydoc));
    };

    const onUpdate = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        flush();
      }, 1200);
    };

    ydoc.on("update", onUpdate);
    return () => {
      ydoc.off("update", onUpdate);
      if (timer !== undefined) clearTimeout(timer);
      flush();
    };
  }, [ready, workspaceId]);

  if (!ready) {
    return <div style={{ padding: "1rem", fontFamily: "system-ui" }}>Se conectează workspace…</div>;
  }

  return <WorkspaceCollabContext.Provider value={ready}>{children}</WorkspaceCollabContext.Provider>;
}

export function useWorkspaceCollab(): ReadyState {
  const v = useContext(WorkspaceCollabContext);
  if (!v) {
    throw new Error("useWorkspaceCollab trebuie folosit în WorkspaceCollabProvider");
  }
  return v;
}

/** Starea conexiunii provider (reconnect / sync) pentru UX minimal. */
export function useCollabConnectionStatus(): {
  wsConnected: boolean;
  synced: boolean;
} {
  const { provider } = useWorkspaceCollab();
  const [wsConnected, setWsConnected] = useState(provider.wsconnected);
  const [synced, setSynced] = useState(provider.synced);

  useEffect(() => {
    const onStatus = (): void => {
      setWsConnected(provider.wsconnected);
      setSynced(provider.synced);
    };
    provider.on("status", onStatus);
    provider.on("sync", onStatus);
    onStatus();
    return () => {
      provider.off("status", onStatus);
      provider.off("sync", onStatus);
    };
  }, [provider]);

  return { wsConnected, synced };
}
