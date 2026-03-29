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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog.js";
import { InlineBanner } from "../../components/ui/inline-banner.js";
import { useToast } from "../../components/ui/toast.js";
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
  const { toast } = useToast();
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
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);

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
      prev && paths.includes(prev) ? prev : (paths[0] ?? null),
    );
  }, [paths]);

  const ytext = useMemo(() => {
    if (!previewFiles || !activePath) return null;
    return previewFiles.get(activePath) ?? null;
  }, [previewFiles, activePath]);

  const maxSlider = Math.max(0, checkpoints.length - 1);

  async function onRestore(): Promise<void> {
    if (!selected) return;
    setRestoreBusy(true);
    try {
      suppressAutosavePersistForMs(20_000);
      await restoreSnapshotCheckpoint(workspaceId, selected.id);
      toast({
        title: "Checkpoint restaurat",
        description:
          "Reîncarc sesiunea ca toți colaboratorii să revină pe aceeași versiune.",
        tone: "success",
      });
      setRestoreDialogOpen(false);
      window.setTimeout(() => {
        window.location.reload();
      }, 650);
    } catch (e) {
      toast({
        title: "Restaurarea a eșuat",
        description:
          e instanceof Error
            ? e.message
            : "Nu am putut aplica checkpoint-ul selectat.",
        tone: "error",
      });
    } finally {
      setRestoreBusy(false);
    }
  }

  const hasCheckpoints = checkpoints.length > 0;

  return (
    <section
      style={{
        width: "100%",
        height: "100%",
        padding: "12px",
        background:
          "linear-gradient(180deg, rgba(14, 20, 30, 0.98) 0%, rgba(9, 15, 23, 0.98) 100%)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        flex: 1,
        minHeight: 0,
        minWidth: 0,
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
        <div style={{ fontWeight: 700, color: "#e6eef7", fontSize: 14 }}>
          Istoric & replay{" "}
          <span style={{ fontWeight: 500, color: "#6b7c91", fontSize: 11 }}>
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
            padding: "7px 11px",
            borderRadius: 10,
            border: "1px solid rgba(130, 160, 192, 0.2)",
            background: "transparent",
            color: "#e5eef6",
            cursor: listLoading ? "wait" : "pointer",
            opacity: listLoading ? 0.7 : 1,
            fontWeight: 600,
          }}
        >
          Reîncarcă lista
        </button>
      </div>

      {!listLoading && loadError && (
        <InlineBanner
          tone="error"
          title="Istoricul nu s-a încărcat"
          description={loadError}
          compact={true}
        />
      )}

      {!listLoading && !loadError && !hasCheckpoints && (
        <InlineBanner
          tone="info"
          title="Nu există checkpoint-uri încă"
          description={
            <>
              Lista e goală: încă nu s-au înregistrat checkpoint-uri. Ele apar
              la autosave, înainte de <strong>Run</strong> și după{" "}
              <strong>Accept</strong> la o sugestie AI.
            </>
          }
        />
      )}

      {hasCheckpoints && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <label style={{ fontSize: 12, color: "#94a8c4", flex: "1 1 180px" }}>
            Timp:{" "}
            {selected
              ? `${kindLabel(selected.kind)} · ${formatTime(selected.createdAt)}`
              : "—"}
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
        <InlineBanner
          tone="info"
          title="Se încarcă previzualizarea"
          description="Pregătesc snapshot-ul selectat pentru comparare și restore."
          compact={true}
        />
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
              borderRight: "1px solid rgba(130, 160, 192, 0.12)",
              padding: 10,
              fontSize: 12,
              background: "rgba(8, 14, 22, 0.92)",
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
                  borderRadius: 10,
                  cursor: "pointer",
                  background:
                    activePath === p
                      ? "linear-gradient(180deg, rgba(15, 74, 109, 0.72), rgba(10, 51, 76, 0.9))"
                      : "transparent",
                  color: activePath === p ? "#eef9ff" : "#94a8c4",
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

      {hasCheckpoints &&
        !previewLoading &&
        previewYdoc &&
        paths.length === 0 && (
          <InlineBanner
            tone="warning"
            title="Snapshot gol"
            description="Checkpoint-ul selectat nu conține fișiere previzualizabile."
            compact={true}
          />
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
            setRestoreDialogOpen(true);
          }}
          style={{
            padding: "10px 15px",
            borderRadius: 12,
            border: "1px solid rgba(100, 199, 255, 0.26)",
            background:
              "linear-gradient(180deg, rgba(15, 74, 109, 0.72), rgba(10, 51, 76, 0.9))",
            color: "#eef9ff",
            cursor:
              !hasCheckpoints || !selected || restoreBusy
                ? "not-allowed"
                : "pointer",
            opacity: !hasCheckpoints || !selected || restoreBusy ? 0.55 : 1,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {restoreBusy ? "Se restaurează…" : "Restaurează acest checkpoint…"}
        </button>
      </div>

      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restaurezi acest checkpoint?</DialogTitle>
            <DialogDescription>
              Snapshot-ul curent din editor va fi înlocuit, iar colaboratorii
              trebuie să reîncarce sesiunea pentru a vedea aceeași versiune.
            </DialogDescription>
          </DialogHeader>

          {selected ? (
            <InlineBanner
              tone="warning"
              title={`${kindLabel(selected.kind)} · ${formatTime(selected.createdAt)}`}
              description={`Checkpoint ${selected.id.slice(0, 8)} va deveni noul punct activ al workspace-ului.`}
              compact={true}
            />
          ) : null}

          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setRestoreDialogOpen(false);
              }}
              style={{
                border: "1px solid rgba(130, 160, 192, 0.24)",
                background: "transparent",
                color: "#c9d7e5",
                borderRadius: 12,
                padding: "10px 14px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Revino
            </button>
            <button
              type="button"
              data-autofocus="true"
              disabled={restoreBusy}
              onClick={() => {
                void onRestore();
              }}
              style={{
                border: "1px solid rgba(246, 196, 83, 0.24)",
                background:
                  "linear-gradient(180deg, rgba(117, 84, 18, 0.9), rgba(88, 62, 12, 0.98))",
                color: "#fff1c9",
                borderRadius: 12,
                padding: "10px 14px",
                cursor: restoreBusy ? "wait" : "pointer",
                fontWeight: 700,
                opacity: restoreBusy ? 0.72 : 1,
              }}
            >
              {restoreBusy ? "Se aplică restore-ul…" : "Confirmă restore"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
