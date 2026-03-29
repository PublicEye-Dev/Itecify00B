import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { AiSuggestionPersisted, TargetRange } from "@itecify/shared/ai";
import type { UserDto } from "@itecify/shared/auth";
import type { WorkspaceTemplateDto } from "@itecify/shared/workspaces";
import { Link } from "react-router-dom";
import * as Y from "yjs";
import { CollaboratorStrip } from "../../components/collaborators/CollaboratorStrip.js";
import { ShareLinkButton } from "../../components/share/ShareLinkButton.js";
import { AiSuggestionsSidebar } from "../../features/ai/AiSuggestionsSidebar.js";
import { LocalPresenceBridge } from "../../features/presence/LocalPresenceBridge.js";
import { useCollabPresencePeers } from "../../features/presence/useCollabPresencePeers.js";
import {
  useCollabConnectionStatus,
  useWorkspaceCollab,
} from "../../lib/collab/WorkspaceCollabProvider.js";
import { stableHexColorForUserId } from "../../lib/collab/collabColors.js";
import {
  isAutosavePersistSuppressed,
  persistWorkspaceSnapshotBlocking,
  saveManualCheckpointToHistory,
} from "../../lib/collab/snapshotApi.js";
import { useWorkspaceAiPresence } from "../../lib/collab/useWorkspaceAiPresence.js";
import { CollabMonacoEditor } from "../editor/CollabMonacoEditor.js";
import { ReplayPanel } from "../replay/ReplayPanel.js";
import { RunPanel } from "../run/RunPanel.js";
import { useWorkspaceRun } from "../run/useWorkspaceRun.js";
import { FileTree } from "./FileTree.js";
import {
  createUntitledFile,
  deleteFile,
  renameFile,
} from "./workspaceFileOps.js";
import { useYjsFilePaths } from "./useYjsFilePaths.js";

const LEFT_PANEL_DEFAULT_WIDTH = 260;
const LEFT_PANEL_MIN_WIDTH = 180;
const RIGHT_PANEL_DEFAULT_WIDTH = 360;
const RIGHT_PANEL_MIN_WIDTH = 260;
const CENTER_PANEL_MIN_WIDTH = 360;
const BOTTOM_PANEL_DEFAULT_HEIGHT = 320;
const BOTTOM_PANEL_MIN_HEIGHT = 220;
const TOP_SECTION_MIN_HEIGHT = 220;
const HANDLE_SIZE = 10;
const KEYBOARD_RESIZE_STEP = 24;

type BottomWorkspaceTab = "run" | "history";

type ResizeHandleKind = "left" | "right" | "bottom";

export function WorkspaceCollabLayout({
  workspaceId,
  workspaceName,
  shareToken,
  workspaceTemplate,
  currentUser,
  onLogout,
}: {
  workspaceId: string;
  workspaceName: string;
  shareToken: string;
  workspaceTemplate: WorkspaceTemplateDto;
  currentUser: UserDto;
  onLogout: () => Promise<void>;
}): ReactNode {
  const { ydoc, provider, files } = useWorkspaceCollab();
  const panelStorageKey = useMemo(
    () => `itecify:workspace-layout:${workspaceId}`,
    [workspaceId],
  );
  const [leftPanelWidth, setLeftPanelWidth] = useStoredPanelSize(
    `${panelStorageKey}:files`,
    LEFT_PANEL_DEFAULT_WIDTH,
  );
  const [rightPanelWidth, setRightPanelWidth] = useStoredPanelSize(
    `${panelStorageKey}:ai`,
    RIGHT_PANEL_DEFAULT_WIDTH,
  );
  const [bottomPanelHeight, setBottomPanelHeight] = useStoredPanelSize(
    `${panelStorageKey}:bottom`,
    BOTTOM_PANEL_DEFAULT_HEIGHT,
  );
  const [bottomTab, setBottomTab] = useStoredBottomTab(
    `${panelStorageKey}:bottomTab`,
    "run",
  );
  const [activePath, setActivePath] = useState<string | null>(null);
  const [pendingSuggestions, setPendingSuggestions] = useState<
    AiSuggestionPersisted[]
  >([]);
  const [revealRequest, setRevealRequest] = useState<{
    range: TargetRange;
    key: number;
  } | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<ResizeHandleKind | null>(
    null,
  );
  const revealKeyRef = useRef(0);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const layoutBodyRef = useRef<HTMLDivElement | null>(null);
  const topRowRef = useRef<HTMLDivElement | null>(null);
  const paths = useYjsFilePaths(files);

  const getTopRowWidth = useCallback(() => {
    if (topRowRef.current) {
      return topRowRef.current.clientWidth;
    }
    return window.innerWidth;
  }, []);

  const getLayoutBodyHeight = useCallback(() => {
    if (layoutBodyRef.current) {
      return layoutBodyRef.current.clientHeight;
    }
    return window.innerHeight;
  }, []);

  const getMaxLeftPanelWidth = useCallback(() => {
    const maxWidth =
      getTopRowWidth() -
      rightPanelWidth -
      CENTER_PANEL_MIN_WIDTH -
      HANDLE_SIZE * 2;
    return Math.max(LEFT_PANEL_MIN_WIDTH, maxWidth);
  }, [getTopRowWidth, rightPanelWidth]);

  const getMaxRightPanelWidth = useCallback(() => {
    const maxWidth =
      getTopRowWidth() -
      leftPanelWidth -
      CENTER_PANEL_MIN_WIDTH -
      HANDLE_SIZE * 2;
    return Math.max(RIGHT_PANEL_MIN_WIDTH, maxWidth);
  }, [getTopRowWidth, leftPanelWidth]);

  const getMaxBottomPanelHeight = useCallback(() => {
    const maxHeight =
      getLayoutBodyHeight() - TOP_SECTION_MIN_HEIGHT - HANDLE_SIZE;
    return Math.max(BOTTOM_PANEL_MIN_HEIGHT, maxHeight);
  }, [getLayoutBodyHeight]);

  const updateLeftPanelWidth = useCallback(
    (nextWidth: number) => {
      setLeftPanelWidth(
        clamp(nextWidth, LEFT_PANEL_MIN_WIDTH, getMaxLeftPanelWidth()),
      );
    },
    [getMaxLeftPanelWidth, setLeftPanelWidth],
  );

  const updateRightPanelWidth = useCallback(
    (nextWidth: number) => {
      setRightPanelWidth(
        clamp(nextWidth, RIGHT_PANEL_MIN_WIDTH, getMaxRightPanelWidth()),
      );
    },
    [getMaxRightPanelWidth, setRightPanelWidth],
  );

  const updateBottomPanelHeight = useCallback(
    (nextHeight: number) => {
      setBottomPanelHeight(
        clamp(
          nextHeight,
          BOTTOM_PANEL_MIN_HEIGHT,
          getMaxBottomPanelHeight(),
        ),
      );
    },
    [getMaxBottomPanelHeight, setBottomPanelHeight],
  );

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    const clampPanelSizes = () => {
      setLeftPanelWidth((current) =>
        clamp(current, LEFT_PANEL_MIN_WIDTH, getMaxLeftPanelWidth()),
      );
      setRightPanelWidth((current) =>
        clamp(current, RIGHT_PANEL_MIN_WIDTH, getMaxRightPanelWidth()),
      );
      setBottomPanelHeight((current) =>
        clamp(
          current,
          BOTTOM_PANEL_MIN_HEIGHT,
          getMaxBottomPanelHeight(),
        ),
      );
    };

    clampPanelSizes();
    window.addEventListener("resize", clampPanelSizes);
    return () => {
      window.removeEventListener("resize", clampPanelSizes);
    };
  }, [
    getMaxLeftPanelWidth,
    getMaxRightPanelWidth,
    getMaxBottomPanelHeight,
    setLeftPanelWidth,
    setRightPanelWidth,
    setBottomPanelHeight,
  ]);

  const startResizeDrag = useCallback(
    (kind: ResizeHandleKind, event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();

      dragCleanupRef.current?.();

      const startX = event.clientX;
      const startY = event.clientY;
      const startLeftWidth = leftPanelWidth;
      const startRightWidth = rightPanelWidth;
      const startBottomHeight = bottomPanelHeight;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      setDraggingHandle(kind);
      document.body.style.cursor =
        kind === "bottom" ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";

      const cleanup = () => {
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        dragCleanupRef.current = null;
        setDraggingHandle(null);
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (kind === "left") {
          updateLeftPanelWidth(startLeftWidth + (moveEvent.clientX - startX));
          return;
        }
        if (kind === "right") {
          updateRightPanelWidth(startRightWidth - (moveEvent.clientX - startX));
          return;
        }
        updateBottomPanelHeight(
          startBottomHeight - (moveEvent.clientY - startY),
        );
      };

      const onPointerUp = () => {
        cleanup();
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      dragCleanupRef.current = cleanup;
    },
    [
      leftPanelWidth,
      rightPanelWidth,
      bottomPanelHeight,
      updateLeftPanelWidth,
      updateRightPanelWidth,
      updateBottomPanelHeight,
    ],
  );

  const handleResizeKeyDown = useCallback(
    (kind: ResizeHandleKind, event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (kind === "left") {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          updateLeftPanelWidth(leftPanelWidth - KEYBOARD_RESIZE_STEP);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          updateLeftPanelWidth(leftPanelWidth + KEYBOARD_RESIZE_STEP);
          return;
        }
      }

      if (kind === "right") {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          updateRightPanelWidth(rightPanelWidth + KEYBOARD_RESIZE_STEP);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          updateRightPanelWidth(rightPanelWidth - KEYBOARD_RESIZE_STEP);
          return;
        }
      }

      if (kind === "bottom") {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          updateBottomPanelHeight(bottomPanelHeight + KEYBOARD_RESIZE_STEP);
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          updateBottomPanelHeight(bottomPanelHeight - KEYBOARD_RESIZE_STEP);
        }
      }
    },
    [
      leftPanelWidth,
      rightPanelWidth,
      bottomPanelHeight,
      updateLeftPanelWidth,
      updateRightPanelWidth,
      updateBottomPanelHeight,
    ],
  );

  const resetPanelSize = useCallback(
    (kind: ResizeHandleKind) => {
      if (kind === "left") {
        updateLeftPanelWidth(LEFT_PANEL_DEFAULT_WIDTH);
        return;
      }
      if (kind === "right") {
        updateRightPanelWidth(RIGHT_PANEL_DEFAULT_WIDTH);
        return;
      }
      updateBottomPanelHeight(BOTTOM_PANEL_DEFAULT_HEIGHT);
    },
    [updateLeftPanelWidth, updateRightPanelWidth, updateBottomPanelHeight],
  );

  const leftPanelMaxWidth = getMaxLeftPanelWidth();
  const rightPanelMaxWidth = getMaxRightPanelWidth();
  const bottomPanelMaxHeight = getMaxBottomPanelHeight();

  useEffect(() => {
    if (paths.length === 0) {
      setActivePath(null);
      return;
    }
    if (!activePath || !files.has(activePath)) {
      setActivePath(paths[0]!);
    }
  }, [paths, activePath, files]);

  const handleReveal = useCallback((filePath: string, range: TargetRange) => {
    setActivePath(filePath);
    revealKeyRef.current += 1;
    setRevealRequest({ range, key: revealKeyRef.current });
  }, []);

  const clearReveal = useCallback(() => setRevealRequest(null), []);
  const { wsConnected, synced } = useCollabConnectionStatus();
  const peers = useCollabPresencePeers(provider.awareness);
  const {
    presence: aiPresence,
    send: sendAiPresence,
    wsConnected: aiPresenceWs,
  } = useWorkspaceAiPresence(workspaceId);
  const cursorHex = useMemo(
    () => stableHexColorForUserId(currentUser.id),
    [currentUser.id],
  );

  const peerFileColors = useMemo(() => {
    const next = new Map<string, string>();
    for (const peer of peers) {
      if (peer.isSelf || !peer.activeFile) continue;
      if (!next.has(peer.activeFile)) {
        next.set(peer.activeFile, peer.color);
      }
    }
    return next;
  }, [peers]);

  const ytext = useMemo(
    () => (activePath ? (files.get(activePath) ?? null) : null),
    [activePath, files],
  );

  const aiDecorationRanges = useMemo(() => {
    return pendingSuggestions
      .filter(
        (suggestion) =>
          suggestion.filePath === activePath && suggestion.targetRange,
      )
      .map((suggestion) => ({
        id: suggestion.id,
        range: suggestion.targetRange!,
      }));
  }, [pendingSuggestions, activePath]);

  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [manualSaveBusy, setManualSaveBusy] = useState(false);
  const [manualSaveHint, setManualSaveHint] = useState<string | null>(null);
  const manualSaveInFlight = useRef(false);
  const manualSaveHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const handleManualSaveRef = useRef<() => Promise<void>>(async () => {});

  const handleManualSave = useCallback(async () => {
    if (manualSaveInFlight.current) return;
    if (isAutosavePersistSuppressed()) {
      window.alert(
        "Salvare checkpoint indisponibilă momentan (restore sau operație în curs). Încearcă după câteva secunde.",
      );
      return;
    }
    manualSaveInFlight.current = true;
    setManualSaveBusy(true);
    setManualSaveHint(null);
    try {
      const { checkpointId } = await saveManualCheckpointToHistory(
        workspaceId,
        Y.encodeStateAsUpdate(ydoc),
      );
      setHistoryRefreshKey((k) => k + 1);
      window.dispatchEvent(
        new CustomEvent("itecify-checkpoints-changed", {
          detail: { workspaceId },
        }),
      );
      const t = new Date();
      const timeStr = t.toLocaleTimeString("ro-RO", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setManualSaveHint(
        `Checkpoint salvat (${timeStr}) · id ${checkpointId.slice(0, 8)}…`,
      );
      if (manualSaveHintTimerRef.current) {
        clearTimeout(manualSaveHintTimerRef.current);
      }
      manualSaveHintTimerRef.current = setTimeout(() => {
        setManualSaveHint(null);
        manualSaveHintTimerRef.current = null;
      }, 4500);
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "Salvarea checkpoint-ului a eșuat.",
      );
    } finally {
      manualSaveInFlight.current = false;
      setManualSaveBusy(false);
    }
  }, [workspaceId, ydoc]);

  useEffect(() => {
    handleManualSaveRef.current = handleManualSave;
  }, [handleManualSave]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== "s") return;
      e.preventDefault();
      e.stopPropagation();
      void handleManualSaveRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (manualSaveHintTimerRef.current) {
        clearTimeout(manualSaveHintTimerRef.current);
      }
    };
  }, []);

  const runner = useWorkspaceRun({
    workspaceId,
    template: workspaceTemplate,
    persistSnapshot: async () => {
      await persistWorkspaceSnapshotBlocking(
        workspaceId,
        Y.encodeStateAsUpdate(ydoc),
      );
    },
    onAfterSnapshotPersist: () => {
      setHistoryRefreshKey((k) => k + 1);
    },
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#1e1e1e",
        color: "#ddd",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <LocalPresenceBridge
        awareness={provider.awareness}
        displayName={currentUser.name}
        activeFile={activePath}
      />
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          padding: "8px 12px",
          borderBottom: "1px solid #333",
          gap: 12,
        }}
      >
        <div
          style={{
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Link
            to="/"
            style={{
              color: "#8ab4ff",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            ← Dashboard
          </Link>
          <span>
            iTECify · <code style={{ fontSize: 12 }}>{workspaceId}</code>
          </span>
          <ShareLinkButton
            shareToken={shareToken}
            workspaceName={workspaceName}
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 13,
            opacity: 0.92,
          }}
        >
          <div>
            Collab:&nbsp;
            <span style={{ color: wsConnected ? "#7d7" : "#d77" }}>
              {wsConnected ? "WebSocket conectat" : "se reconectează…"}
            </span>
            &nbsp;·&nbsp;
            <span style={{ color: synced ? "#7d7" : "#dd7" }}>
              {synced ? "sincronizat" : "sync…"}
            </span>
          </div>
          <div
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid #3b5164",
              background: "#142331",
            }}
          >
            {currentUser.name} · {currentUser.role}
          </div>
          <button
            onClick={() => {
              void onLogout();
            }}
            style={{
              border: "1px solid #54718c",
              background: "transparent",
              color: "#e5eef6",
              borderRadius: 8,
              padding: "6px 10px",
              cursor: "pointer",
            }}
            type="button"
          >
            Logout
          </button>
        </div>
      </header>

      <CollaboratorStrip peers={peers} aiPresence={aiPresence} />

      <div
        ref={layoutBodyRef}
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        <div
          ref={topRowRef}
          style={{
            display: "flex",
            flex: 1,
            minHeight: TOP_SECTION_MIN_HEIGHT,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: leftPanelWidth,
              minWidth: LEFT_PANEL_MIN_WIDTH,
              maxWidth: leftPanelMaxWidth,
              flexShrink: 0,
              minHeight: 0,
            }}
          >
            <FileTree
              activePath={activePath}
              peerFileColors={peerFileColors}
              onSelect={setActivePath}
              onCreate={() => {
                const path = createUntitledFile(ydoc);
                setActivePath(path);
              }}
              onRename={(path) => {
                const next = window.prompt("Cale nouă (ex: src/main.ts)", path);
                if (next == null) return;
                if (!renameFile(ydoc, path, next)) {
                  window.alert("Redenumire invalidă sau fișier existent.");
                  return;
                }
                if (activePath === path) {
                  setActivePath(next.trim());
                }
              }}
              onDelete={(path) => {
                if (!window.confirm(`Ștergi ${path}?`)) return;
                deleteFile(ydoc, path);
              }}
              style={{ width: "100%", height: "100%" }}
            />
          </div>

          <ResizeHandle
            ariaLabel="Resize Files Explorer"
            isDragging={draggingHandle === "left"}
            onDoubleClick={() => {
              resetPanelSize("left");
            }}
            onKeyDown={(event) => {
              handleResizeKeyDown("left", event);
            }}
            onPointerDown={(event) => {
              startResizeDrag("left", event);
            }}
            orientation="vertical"
          />

          <div
            style={{
              display: "flex",
              flex: 1,
              minWidth: CENTER_PANEL_MIN_WIDTH,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <CollabMonacoEditor
              workspaceId={workspaceId}
              activePath={activePath}
              ytext={ytext}
              localUser={{ id: currentUser.id, name: currentUser.name }}
              cursorColorHex={cursorHex}
              aiDecorationRanges={aiDecorationRanges}
              revealRequest={revealRequest}
              onRevealHandled={clearReveal}
            />
          </div>

          <ResizeHandle
            ariaLabel="Resize AI Sidebar"
            isDragging={draggingHandle === "right"}
            onDoubleClick={() => {
              resetPanelSize("right");
            }}
            onKeyDown={(event) => {
              handleResizeKeyDown("right", event);
            }}
            onPointerDown={(event) => {
              startResizeDrag("right", event);
            }}
            orientation="vertical"
          />

          <div
            style={{
              width: rightPanelWidth,
              minWidth: RIGHT_PANEL_MIN_WIDTH,
              maxWidth: rightPanelMaxWidth,
              flexShrink: 0,
              minHeight: 0,
            }}
          >
            <AiSuggestionsSidebar
              workspaceId={workspaceId}
              currentUserId={currentUser.id}
              activePath={activePath}
              setActivePath={setActivePath}
              files={files}
              ydoc={ydoc}
              sendAiPresence={sendAiPresence}
              aiPresenceChannelReady={aiPresenceWs}
              onPendingChange={setPendingSuggestions}
              onRequestReveal={handleReveal}
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        </div>

        <ResizeHandle
          ariaLabel="Redimensionează panoul inferior (Run / Istoric)"
          isDragging={draggingHandle === "bottom"}
          onDoubleClick={() => {
            resetPanelSize("bottom");
          }}
          onKeyDown={(event) => {
            handleResizeKeyDown("bottom", event);
          }}
          onPointerDown={(event) => {
            startResizeDrag("bottom", event);
          }}
          orientation="horizontal"
        />

        <div
          style={{
            height: bottomPanelHeight,
            minHeight: BOTTOM_PANEL_MIN_HEIGHT,
            maxHeight: bottomPanelMaxHeight,
            flexShrink: 0,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: "#0f1419",
          }}
        >
          <div
            style={{
              flexShrink: 0,
              borderBottom: "1px solid #2a3340",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-end",
                gap: 8,
                padding: "6px 10px 0",
              }}
            >
              <div
                role="tablist"
                aria-label="Panou inferior workspace"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 4,
                  flex: "1 1 200px",
                  minWidth: 0,
                }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={bottomTab === "run"}
                  id={`${workspaceId}-tab-run`}
                  aria-controls={`${workspaceId}-panel-run`}
                  onClick={() => {
                    setBottomTab("run");
                  }}
                  style={{
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    border: "none",
                    borderRadius: "8px 8px 0 0",
                    cursor: "pointer",
                    background:
                      bottomTab === "run"
                        ? "rgba(56, 189, 248, 0.12)"
                        : "transparent",
                    color: bottomTab === "run" ? "#e5eef6" : "#94a8c4",
                    borderBottom:
                      bottomTab === "run"
                        ? "2px solid #38bdf8"
                        : "2px solid transparent",
                    marginBottom: -1,
                  }}
                >
                  Run Pipeline
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={bottomTab === "history"}
                  id={`${workspaceId}-tab-history`}
                  aria-controls={`${workspaceId}-panel-history`}
                  onClick={() => {
                    setBottomTab("history");
                  }}
                  style={{
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    border: "none",
                    borderRadius: "8px 8px 0 0",
                    cursor: "pointer",
                    background:
                      bottomTab === "history"
                        ? "rgba(56, 189, 248, 0.12)"
                        : "transparent",
                    color: bottomTab === "history" ? "#e5eef6" : "#94a8c4",
                    borderBottom:
                      bottomTab === "history"
                        ? "2px solid #38bdf8"
                        : "2px solid transparent",
                    marginBottom: -1,
                  }}
                >
                  Istoric & replay
                </button>
              </div>
              <button
                type="button"
                disabled={manualSaveBusy}
                title="Salvează starea curentă a workspace-ului ca punct în istoric (Ctrl+S / Cmd+S)"
                onClick={() => {
                  void handleManualSave();
                }}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 8,
                  cursor: manualSaveBusy ? "wait" : "pointer",
                  border: "1px solid rgba(56, 189, 248, 0.45)",
                  background: "rgba(56, 189, 248, 0.14)",
                  color: "#e0f2fe",
                  opacity: manualSaveBusy ? 0.75 : 1,
                  whiteSpace: "nowrap",
                  marginBottom: 2,
                }}
              >
                {manualSaveBusy ? "Se salvează checkpoint…" : "Salvează checkpoint"}
              </button>
            </div>
          </div>
          {manualSaveHint ? (
            <div
              role="status"
              style={{
                padding: "4px 10px 6px",
                fontSize: 12,
                color: "#86efac",
                flexShrink: 0,
              }}
            >
              {manualSaveHint}
            </div>
          ) : null}

          <div
            role="tabpanel"
            id={`${workspaceId}-panel-run`}
            aria-labelledby={`${workspaceId}-tab-run`}
            hidden={bottomTab !== "run"}
            style={{
              flex: 1,
              minHeight: 0,
              display: bottomTab === "run" ? "flex" : "none",
              flexDirection: "column",
              overflow: "auto",
            }}
          >
            <RunPanel
              job={runner.job}
              liveLogs={runner.liveLogs}
              error={runner.error}
              isStarting={runner.isStarting}
              canStart={runner.canStart}
              streamState={runner.streamState}
              template={workspaceTemplate}
              onRun={runner.startRun}
            />
          </div>

          <div
            role="tabpanel"
            id={`${workspaceId}-panel-history`}
            aria-labelledby={`${workspaceId}-tab-history`}
            hidden={bottomTab !== "history"}
            style={{
              flex: 1,
              minHeight: 0,
              display: bottomTab === "history" ? "flex" : "none",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <ReplayPanel
              workspaceId={workspaceId}
              refreshKey={historyRefreshKey}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ResizeHandle({
  ariaLabel,
  isDragging,
  onDoubleClick,
  onKeyDown,
  onPointerDown,
  orientation,
}: {
  ariaLabel: string;
  isDragging: boolean;
  onDoubleClick: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  orientation: "horizontal" | "vertical";
}): ReactNode {
  const vertical = orientation === "vertical";

  return (
    <div
      aria-label={ariaLabel}
      aria-orientation={orientation}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      role="separator"
      tabIndex={0}
      title={`${ariaLabel}. Drag to resize or double-click to reset.`}
      style={{
        width: vertical ? HANDLE_SIZE : "100%",
        height: vertical ? "100%" : HANDLE_SIZE,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: vertical ? "col-resize" : "row-resize",
        touchAction: "none",
        background: isDragging
          ? "rgba(56, 189, 248, 0.18)"
          : "rgba(15, 23, 42, 0.92)",
        borderLeft: vertical ? "1px solid #0f172a" : undefined,
        borderRight: vertical ? "1px solid #0f172a" : undefined,
        borderTop: vertical ? undefined : "1px solid #0f172a",
        borderBottom: vertical ? undefined : "1px solid #0f172a",
        outline: "none",
      }}
    >
      <span
        style={{
          width: vertical ? 3 : 52,
          height: vertical ? 52 : 3,
          borderRadius: 999,
          background: isDragging ? "#38bdf8" : "#334155",
        }}
      />
    </div>
  );
}

function useStoredBottomTab(
  key: string,
  fallback: BottomWorkspaceTab,
): readonly [BottomWorkspaceTab, (tab: BottomWorkspaceTab) => void] {
  const [tab, setTab] = useState<BottomWorkspaceTab>(() => {
    if (typeof window === "undefined") {
      return fallback;
    }
    const raw = window.localStorage.getItem(key);
    if (raw === "run" || raw === "history") {
      return raw;
    }
    return fallback;
  });

  useEffect(() => {
    window.localStorage.setItem(key, tab);
  }, [key, tab]);

  return [tab, setTab] as const;
}

function useStoredPanelSize(key: string, fallback: number) {
  const [value, setValue] = useState(() => {
    if (typeof window === "undefined") {
      return fallback;
    }
    const raw = window.localStorage.getItem(key);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  });

  useEffect(() => {
    window.localStorage.setItem(key, String(Math.round(value)));
  }, [key, value]);

  return [value, setValue] as const;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
