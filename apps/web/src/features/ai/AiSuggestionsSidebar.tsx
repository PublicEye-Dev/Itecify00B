import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import * as Y from "yjs";
import type { Map as YMap, Text as YText } from "yjs";
import type { TargetRange } from "@itecify/shared/ai";
import type { AiSuggestionPersisted } from "@itecify/shared/ai";
import { SuggestionCard } from "../../components/suggestions/SuggestionCard.js";
import {
  createAiSuggestions,
  listAiSuggestions,
  patchAiSuggestion,
} from "../../lib/api/aiApi.js";
import { recordSnapshotCheckpointExplicit } from "../../lib/collab/snapshotApi.js";
import { ApiClientError } from "../../lib/api/client.js";
import type { SendAiPresenceInput } from "../../lib/collab/useWorkspaceAiPresence.js";
import { applySuggestionToYText } from "./applySuggestionToYText.js";
import { hasSuggestionConflict } from "./suggestionConflict.js";

const STANDBY_DELAY_MS = 2800;

export function AiSuggestionsSidebar({
  workspaceId,
  currentUserId,
  activePath,
  setActivePath,
  files,
  ydoc,
  sendAiPresence,
  aiPresenceChannelReady,
  onPendingChange,
  onRequestReveal,
  style,
}: {
  workspaceId: string;
  currentUserId: string;
  activePath: string | null;
  setActivePath: (path: string) => void;
  files: YMap<YText>;
  ydoc: Y.Doc;
  sendAiPresence: (input: SendAiPresenceInput) => void;
  aiPresenceChannelReady: boolean;
  onPendingChange?: (rows: AiSuggestionPersisted[]) => void;
  onRequestReveal: (filePath: string, range: TargetRange) => void;
  style?: CSSProperties;
}): ReactNode {
  const [instruction, setInstruction] = useState(
    "Îmbunătățește claritatea și adaugă un comentariu scurt la începutul fișierului.",
  );
  const [genBusy, setGenBusy] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<AiSuggestionPersisted[]>([]);
  const [conflictIds, setConflictIds] = useState<Set<string>>(() => new Set());
  const standbyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const { suggestions } = await listAiSuggestions(workspaceId, true);
      setPending(suggestions);
      onPendingChange?.(suggestions);
    } catch {
      setPending([]);
    }
  }, [workspaceId, onPendingChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (standbyTimerRef.current) clearTimeout(standbyTimerRef.current);
    };
  }, []);

  function scheduleStandby(): void {
    if (standbyTimerRef.current) clearTimeout(standbyTimerRef.current);
    standbyTimerRef.current = setTimeout(() => {
      sendAiPresence({
        status: "standby",
        filePath: null,
        requestedByUserId: "",
      });
      standbyTimerRef.current = null;
    }, STANDBY_DELAY_MS);
  }

  async function onGenerate(): Promise<void> {
    if (!activePath || genBusy || inFlightRef.current) return;
    const ytext = files.get(activePath);
    if (!ytext) {
      setError("Fișierul activ nu există în mapă.");
      return;
    }

    inFlightRef.current = true;
    setGenBusy(true);
    setError(null);

    sendAiPresence({
      status: "thinking",
      filePath: activePath,
      requestedByUserId: currentUserId,
    });

    try {
      sendAiPresence({
        status: "generating",
        filePath: activePath,
        requestedByUserId: currentUserId,
      });

      await createAiSuggestions(workspaceId, {
        instruction: instruction.trim(),
        contextFiles: [{ path: activePath, content: ytext.toString() }],
      });

      sendAiPresence({
        status: "ready",
        filePath: activePath,
        requestedByUserId: currentUserId,
      });
      scheduleStandby();
      await refresh();
    } catch (e) {
      const msg =
        e instanceof ApiClientError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Cererea AI a eșuat.";
      setError(msg);
      sendAiPresence({
        status: "failed",
        filePath: activePath,
        requestedByUserId: currentUserId,
      });
      scheduleStandby();
    } finally {
      inFlightRef.current = false;
      setGenBusy(false);
    }
  }

  async function doReject(id: string): Promise<void> {
    setActionBusyId(id);
    setError(null);
    try {
      await patchAiSuggestion(workspaceId, id, "reject");
      setConflictIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      await refresh();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Respingere eșuată.");
    } finally {
      setActionBusyId(null);
    }
  }

  async function doAccept(id: string, force: boolean): Promise<void> {
    const s = pending.find((x) => x.id === id);
    if (!s?.filePath || !s.targetRange || !s.operationType) return;

    const ytext = files.get(s.filePath);
    if (!ytext) {
      setError("Fișierul nu există în workspace.");
      return;
    }

    const fileText = ytext.toString();
    const conflict =
      !force &&
      hasSuggestionConflict(fileText, s.targetRange, s.sourceSpanText);
    if (conflict) {
      setConflictIds((prev) => new Set(prev).add(id));
      return;
    }

    setActionBusyId(id);
    setError(null);
    try {
      applySuggestionToYText(
        ydoc,
        ytext,
        s.operationType,
        s.targetRange,
        s.replacementText ?? "",
      );
      await patchAiSuggestion(workspaceId, id, "accept");
      const checkpointOk = await recordSnapshotCheckpointExplicit(
        workspaceId,
        "AI_ACCEPTED",
        Y.encodeStateAsUpdate(ydoc),
      );
      if (!checkpointOk && import.meta.env.DEV) {
        console.warn(
          "[itecify:checkpoint] AI_ACCEPTED nu s-a înregistrat în istoric.",
        );
      }
      window.dispatchEvent(
        new CustomEvent("itecify-checkpoints-changed", {
          detail: { workspaceId },
        }),
      );
      setConflictIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      await refresh();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Accept eșuat.");
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <aside
      style={{
        width: 360,
        height: "100%",
        minWidth: 0,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderLeft: "1px solid #2a3340",
        background: "linear-gradient(180deg, #141820 0%, #0d1117 100%)",
        minHeight: 0,
        ...style,
      }}
    >
      <div
        style={{
          padding: "12px 12px 10px",
          borderBottom: "1px solid #2a3340",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "#94a8c4",
            marginBottom: 8,
          }}
        >
          GENERARE AI
        </div>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={3}
          disabled={genBusy}
          style={{
            width: "100%",
            boxSizing: "border-box",
            resize: "vertical",
            minHeight: 56,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #3d4f63",
            background: "#0d1117",
            color: "#e6edf3",
            fontSize: 12,
            fontFamily: "ui-monospace, monospace",
          }}
        />
        <button
          type="button"
          disabled={genBusy || !activePath || !aiPresenceChannelReady}
          onClick={() => void onGenerate()}
          style={{
            marginTop: 8,
            width: "100%",
            border: "1px solid #5b4fc9",
            background: genBusy ? "#2d2654" : "#3d2f7a",
            color: "#ede9fe",
            borderRadius: 8,
            padding: "8px 12px",
            cursor: genBusy ? "wait" : "pointer",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {genBusy ? "Se generează…" : "Generează sugestii"}
        </button>
        {!aiPresenceChannelReady ? (
          <div style={{ fontSize: 11, color: "#c9a227", marginTop: 6 }}>
            Canal prezență AI: se conectează…
          </div>
        ) : null}
      </div>

      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: "#94a8c4",
          padding: "10px 12px 6px",
        }}
      >
        ÎN AȘTEPTARE ({pending.length})
      </div>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "0 10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {error ? (
          <div
            style={{
              fontSize: 12,
              color: "#fca5a5",
              background: "rgba(127,29,29,0.35)",
              border: "1px solid #7f1d1d",
              borderRadius: 8,
              padding: "8px 10px",
            }}
          >
            {error}
          </div>
        ) : null}

        {pending.length === 0 ? (
          <div style={{ fontSize: 12, color: "#64748b", padding: "8px 4px" }}>
            Nicio sugestie în așteptare. Generează din fișierul activ.
          </div>
        ) : (
          pending.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              showConflict={conflictIds.has(s.id)}
              busy={actionBusyId === s.id || genBusy}
              onOpenInEditor={() => {
                if (s.filePath) {
                  setActivePath(s.filePath);
                  if (s.targetRange) {
                    onRequestReveal(s.filePath, s.targetRange);
                  }
                }
              }}
              onAccept={() => void doAccept(s.id, false)}
              onReject={() => void doReject(s.id)}
              onForceAccept={() => void doAccept(s.id, true)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
