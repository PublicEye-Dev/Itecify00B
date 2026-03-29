import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Y from "yjs";
import type { SnapshotCheckpointKindDto } from "@itecify/shared/replay";
import {
  fetchCheckpointSnapshotJson,
  fetchSnapshotCheckpoints,
  restoreSnapshotCheckpoint,
  suppressAutosavePersistForMs,
} from "../../lib/collab/snapshotApi.js";
import { getWorkspaceFilesMap } from "../../lib/collab/workspaceDoc.js";
import { useYjsFilePaths } from "../files/useYjsFilePaths.js";
import { ReplayReadonlyEditor } from "./ReplayReadonlyEditor.js";

function kindLabel(kind: SnapshotCheckpointKindDto): string {
  switch (kind) {
    case "AUTOSAVE":
      return "Autosave";
    case "PRE_RUN":
      return "Înainte de rulare";
    case "AI_ACCEPTED":
      return "După accept AI";
    case "MANUAL_SAVE":
      return "Salvare manuală";
    default:
      return kind;
  }
}

function formatTime(d: Date): string {
  try {
    return d.toLocaleString("ro-RO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return d.toISOString();
  }
}

export function ReplayPanel({
  workspaceId,
  refreshKey = 0,
}: {
  workspaceId: string;
  /** Incrementat după PRE_RUN (run) ca să reîncărce lista fără reload pagină. */
  refreshKey?: number;
}): ReactNode {
  const [checkpoints, setCheckpoints] = useState<
    { id: string; kind: SnapshotCheckpointKindDto; createdAt: Date }[]
  >([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [previewYdoc, setPreviewYdoc] = useState<Y.Doc | null>(null);
  const previewYdocRef = useRef<Y.Doc | null>(null);
  const emptyMapRef = useRef(new Y.Map<Y.Text>());
  const [previewLoading, setPreviewLoading] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);

  const refreshList = useCallback(async () => {
    setLoadError(null);
    setListLoading(true);
    try {
      const list = await fetchSnapshotCheckpoints(workspaceId);
      setCheckpoints(list);
      setSelectedIndex((idx) =>
        list.length === 0 ? 0 : Math.min(idx, list.length - 1),
      );
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Nu am putut încărca istoricul.",
      );
    } finally {
      setListLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (refreshKey > 0) {
      void refreshList();
    }
  }, [refreshKey, refreshList]);

  useEffect(() => {
    const onCheckpointsChanged = (ev: Event): void => {
      const d = (ev as CustomEvent<{ workspaceId?: string }>).detail;
      if (d?.workspaceId === workspaceId) {
        void refreshList();
      }
    };
    window.addEventListener(
      "itecify-checkpoints-changed",
      onCheckpointsChanged as EventListener,
    );
    return () => {
      window.removeEventListener(
        "itecify-checkpoints-changed",
        onCheckpointsChanged as EventListener,
      );
    };
  }, [workspaceId, refreshList]);

  const selected = checkpoints[selectedIndex] ?? null;

  useEffect(() => {
    if (!selected) {
      previewYdocRef.current?.destroy();
      previewYdocRef.current = null;
      setPreviewYdoc(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    void (async () => {
      const json = await fetchCheckpointSnapshotJson(workspaceId, selected.id);
      if (cancelled) return;
      previewYdocRef.current?.destroy();
      previewYdocRef.current = null;
      if (!json || json.update.length === 0) {
        setPreviewYdoc(null);
        setPreviewLoading(false);
        return;
      }
      const doc = new Y.Doc();
      Y.applyUpdate(doc, new Uint8Array(json.update));
      if (cancelled) {
        doc.destroy();
        return;
      }
      previewYdocRef.current = doc;
      setPreviewYdoc(doc);
      setPreviewLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, selected?.id]);

  useEffect(() => {
    return () => {
      previewYdocRef.current?.destroy();
      previewYdocRef.current = null;
    };
  }, []);

  const previewFiles = useMemo(
    () => (previewYdoc ? getWorkspaceFilesMap(previewYdoc) : null),
    [previewYdoc],
  );

  const paths = useYjsFilePaths(previewFiles ?? emptyMapRef.current);
  const [activePath, setActivePath] = useState<string | null>(null);

  useEffect(() => {
    if (paths.length === 0) {
      setActivePath(null);
      return;
    }
    setActivePath((prev) =>
      prev && paths.includes(prev) ? prev : paths[0] ?? null,
    );
  }, [paths]);

  const ytext = useMemo(() => {
    if (!previewFiles || !activePath) return null;
    return previewFiles.get(activePath) ?? null;
  }, [previewFiles, activePath]);

  const maxSlider = Math.max(0, checkpoints.length - 1);

  async function onRestore(): Promise<void> {
    if (!selected) return;
    const ok = window.confirm(
      "Restaurezi workspace-ul la acest checkpoint?\n\n" +
        "Starea curentă din editor va fi înlocuită. " +
        "Colaboratorii trebuie să reîmprospăteze pagina pentru a vedea aceeași versiune.",
    );
    if (!ok) return;
    setRestoreBusy(true);
    try {
      suppressAutosavePersistForMs(20_000);
      await restoreSnapshotCheckpoint(workspaceId, selected.id);
      /* După succes, DB + room collab sunt aliniate; reload remontează providerul Yjs cu starea de pe server. */
      window.location.reload();
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "Restaurarea a eșuat.",
      );
    } finally {
      setRestoreBusy(false);
    }
  }

  const hasCheckpoints = checkpoints.length > 0;

  return (
    <section
      style={{
        padding: "10px 12px",
        background: "#12161c",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 700, color: "#c5d4e8", fontSize: 13 }}>
          Istoric & replay{" "}
          <span style={{ fontWeight: 400, color: "#6b7c91", fontSize: 11 }}>
            (doar citire)
          </span>
          {listLoading ? (
            <span style={{ fontWeight: 400, color: "#6b7c91", fontSize: 11 }}>
              {" "}
              — se încarcă…
            </span>
          ) : (
            <span style={{ fontWeight: 400, color: "#6b7c91", fontSize: 11 }}>
              {" "}
              — {checkpoints.length} checkpoint
              {checkpoints.length === 1 ? "" : "uri"}
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={listLoading}
          onClick={() => {
            void refreshList();
          }}
          style={{
            fontSize: 11,
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid #3b5164",
            background: "transparent",
            color: "#e5eef6",
            cursor: listLoading ? "wait" : "pointer",
            opacity: listLoading ? 0.7 : 1,
          }}
        >
          Reîncarcă lista
        </button>
      </div>

      {!listLoading && loadError && (
        <div style={{ fontSize: 12, color: "#f1a3a3" }}>{loadError}</div>
      )}

      {!listLoading && !loadError && !hasCheckpoints && (
        <div style={{ fontSize: 12, color: "#8b9cb3", lineHeight: 1.5 }}>
          Lista e goală: încă nu s-au înregistrat checkpoint-uri (autosave cu interval minim ~45s între
          puncte, înainte de <strong>Run</strong>, sau după <strong>Accept</strong> la o sugestie AI).
          Verifică că migrarea Prisma pentru <code style={{ fontSize: 11 }}>workspace_snapshot_checkpoints</code>{" "}
          e aplicată pe baza ta; apoi din nou <strong>Reîncarcă lista</strong>.
        </div>
      )}

      {hasCheckpoints && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: "#94a8c4", flex: "1 1 180px" }}>
            Timp: {selected ? `${kindLabel(selected.kind)} · ${formatTime(selected.createdAt)}` : "—"}
          </label>
          <input
            aria-label="Cronologie checkpoint"
            type="range"
            min={0}
            max={maxSlider}
            value={selectedIndex}
            onChange={(e) => {
              setSelectedIndex(Number(e.target.value));
            }}
            style={{ flex: "2 1 240px" }}
          />
        </div>
      )}

      {hasCheckpoints && previewLoading && (
        <div style={{ fontSize: 12, color: "#8b9cb3" }}>Se încarcă previzualizarea…</div>
      )}

      {hasCheckpoints && !previewLoading && previewYdoc && paths.length > 0 && (
        <div
          style={{
            display: "flex",
            flex: 1,
            minHeight: 96,
            minWidth: 0,
            border: "1px solid #2a3340",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: 200,
              minWidth: 160,
              overflow: "auto",
              borderRight: "1px solid #2a3340",
              padding: 8,
              fontSize: 12,
              background: "#0d1117",
            }}
          >
            {paths.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setActivePath(p);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  marginBottom: 4,
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  background:
                    activePath === p ? "rgba(138, 180, 255, 0.15)" : "transparent",
                  color: activePath === p ? "#e5eef6" : "#94a8c4",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 11,
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <ReplayReadonlyEditor
            workspaceId={workspaceId}
            activePath={activePath}
            ytext={ytext}
          />
        </div>
      )}

      {hasCheckpoints && !previewLoading && previewYdoc && paths.length === 0 && (
        <div style={{ fontSize: 12, color: "#8b9cb3" }}>
          Snapshot gol sau fără fișiere.
        </div>
      )}

      <div>
        <button
          type="button"
          disabled={!hasCheckpoints || !selected || restoreBusy}
          title={
            !hasCheckpoints
              ? "Alege sau creează checkpoint-uri (vezi mesajul de mai sus)."
              : undefined
          }
          onClick={() => {
            void onRestore();
          }}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #5c7cfa",
            background: "rgba(92, 124, 250, 0.12)",
            color: "#dbe4ff",
            cursor: !hasCheckpoints || !selected || restoreBusy ? "not-allowed" : "pointer",
            opacity: !hasCheckpoints || !selected || restoreBusy ? 0.55 : 1,
            fontSize: 13,
          }}
        >
          {restoreBusy ? "Se restaurează…" : "Restaurează acest checkpoint…"}
        </button>
      </div>
    </section>
  );
}
