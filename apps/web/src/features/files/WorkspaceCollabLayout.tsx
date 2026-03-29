import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { AiSuggestionPersisted, TargetRange } from "@itecify/shared/ai";
import type { UserDto } from "@itecify/shared/auth";
import type { RunJobStatusDto } from "@itecify/shared/runner";
import type { WorkspaceTemplateDto } from "@itecify/shared/workspaces";
import { Link } from "react-router-dom";
import * as Y from "yjs";
import { CollaboratorStrip } from "../../components/collaborators/CollaboratorStrip.js";
import { ShareLinkButton } from "../../components/share/ShareLinkButton.js";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog.js";
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
import { WorkspaceTerminalPanel } from "../terminal/WorkspaceTerminalPanel.js";
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
const HANDLE_SIZE = 12;
const KEYBOARD_RESIZE_STEP = 24;
const TERMINAL_RUN_STATUSES: RunJobStatusDto[] = [
  "SUCCEEDED",
  "FAILED",
  "TIMEOUT",
  "CANCELLED",
  "BLOCKED",
];

type BottomWorkspaceTab = "run" | "history" | "terminal";

type ResizeHandleKind = "left" | "right" | "bottom";

function shortId(value: string): string {
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

function describeRunOutcome(status: RunJobStatusDto): {
  title: string;
  tone: "success" | "warning" | "error";
} {
  switch (status) {
    case "SUCCEEDED":
      return {
        title: "Pipeline finalizat",
        tone: "success",
      };
    case "BLOCKED":
      return {
        title: "Rularea a fost blocată",
        tone: "warning",
      };
    case "TIMEOUT":
      return {
        title: "Rularea a expirat",
        tone: "warning",
      };
    case "CANCELLED":
      return {
        title: "Rularea a fost anulată",
        tone: "warning",
      };
    default:
      return {
        title: "Rularea a eșuat",
        tone: "error",
      };
  }
}

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
  const { toast } = useToast();
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
  const [renameDialog, setRenameDialog] = useState<{
    path: string;
    nextPath: string;
    error: string | null;
  } | null>(null);
  const [deletePath, setDeletePath] = useState<string | null>(null);
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
        clamp(nextHeight, BOTTOM_PANEL_MIN_HEIGHT, getMaxBottomPanelHeight()),
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
        clamp(current, BOTTOM_PANEL_MIN_HEIGHT, getMaxBottomPanelHeight()),
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
      toast({
        title: "Checkpoint indisponibil momentan",
        description:
          "Există un restore sau o operație de sincronizare în curs. Încearcă din nou în câteva secunde.",
        tone: "warning",
      });
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
      toast({
        title: "Checkpoint salvat",
        description: `Istoricul a fost actualizat la ${timeStr}.`,
        tone: "success",
      });
      if (manualSaveHintTimerRef.current) {
        clearTimeout(manualSaveHintTimerRef.current);
      }
      manualSaveHintTimerRef.current = setTimeout(() => {
        setManualSaveHint(null);
        manualSaveHintTimerRef.current = null;
      }, 4500);
    } catch (e) {
      toast({
        title: "Salvarea checkpoint-ului a eșuat",
        description:
          e instanceof Error
            ? e.message
            : "Nu am putut salva starea curentă în istoric.",
        tone: "error",
      });
    } finally {
      manualSaveInFlight.current = false;
      setManualSaveBusy(false);
    }
  }, [toast, workspaceId, ydoc]);

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

  const lastRunFingerprintRef = useRef<string | null>(null);
  const lastRunErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!runner.error || lastRunErrorRef.current === runner.error) return;
    lastRunErrorRef.current = runner.error;
    toast({
      title: "Pipeline indisponibil",
      description: runner.error,
      tone: "error",
    });
  }, [runner.error, toast]);

  useEffect(() => {
    if (!runner.job || !TERMINAL_RUN_STATUSES.includes(runner.job.status)) {
      return;
    }

    const fingerprint = `${runner.job.id}:${runner.job.status}`;
    if (lastRunFingerprintRef.current === fingerprint) {
      return;
    }
    lastRunFingerprintRef.current = fingerprint;

    const outcome = describeRunOutcome(runner.job.status);
    toast({
      title: outcome.title,
      description:
        runner.job.errorMessage ??
        runner.job.scanReport?.summary ??
        `Job ${shortId(runner.job.id)} s-a încheiat cu status ${runner.job.status}.`,
      tone: outcome.tone,
      durationMs: runner.job.status === "SUCCEEDED" ? 3600 : 5200,
    });
  }, [runner.job, toast]);

  const handleCreateFile = useCallback(() => {
    const path = createUntitledFile(ydoc);
    setActivePath(path);
    toast({
      title: "Fișier creat",
      description: `${path} este gata pentru editare.`,
      tone: "success",
      durationMs: 2600,
    });
  }, [toast, ydoc]);

  const handleRenameSubmit = useCallback(() => {
    if (!renameDialog) return;

    if (!renameFile(ydoc, renameDialog.path, renameDialog.nextPath)) {
      setRenameDialog((current) =>
        current
          ? {
              ...current,
              error: "Redenumire invalidă sau fișier existent.",
            }
          : current,
      );
      return;
    }

    if (activePath === renameDialog.path) {
      setActivePath(renameDialog.nextPath.trim());
    }

    toast({
      title: "Fișier redenumit",
      description: `${renameDialog.path} a devenit ${renameDialog.nextPath.trim()}.`,
      tone: "success",
      durationMs: 2800,
    });
    setRenameDialog(null);
  }, [activePath, renameDialog, toast, ydoc]);

  const handleDeleteConfirm = useCallback(() => {
    if (!deletePath) return;
    deleteFile(ydoc, deletePath);
    toast({
      title: "Fișier șters",
      description: `${deletePath} a fost eliminat din workspace.`,
      tone: "success",
      durationMs: 2800,
    });
    setDeletePath(null);
  }, [deletePath, toast, ydoc]);

  const connectionBanners = useMemo(() => {
    const banners: Array<{
      key: string;
      tone: "info" | "warning" | "error";
      title: string;
      description: string;
    }> = [];

    if (!wsConnected) {
      banners.push({
        key: "collab-disconnected",
        tone: "warning",
        title: "Colaborarea se reconectează",
        description:
          "Editările locale rămân vizibile, dar prezența și sincronizarea live pot avea întârzieri scurte până la refacerea socket-ului.",
      });
    } else if (!synced) {
      banners.push({
        key: "collab-sync",
        tone: "info",
        title: "Workspace-ul se aliniază",
        description:
          "Refacem documentul colaborativ și checkpoint-urile recente. Evită restore-ul până când statusul revine la sincronizat.",
      });
    }

    if (!aiPresenceWs) {
      banners.push({
        key: "ai-presence",
        tone: "warning",
        title: "Prezența AI e în mod limitat",
        description:
          "Sugestiile AI funcționează în continuare, dar indicatorii live de activitate se pot actualiza cu întârziere.",
      });
    }

    return banners;
  }, [aiPresenceWs, synced, wsConnected]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background:
          "radial-gradient(circle at top, rgba(100, 199, 255, 0.08), transparent 24%), linear-gradient(180deg, #09111a 0%, #0b121b 100%)",
        color: "#ddd",
        fontFamily: '"Aptos", "Segoe UI", sans-serif',
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
          padding: "14px 16px 12px",
          borderBottom: "1px solid rgba(130, 160, 192, 0.14)",
          gap: 16,
          background: "rgba(8, 14, 22, 0.78)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <Link
              to="/"
              style={{
                color: "#8ab4ff",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              ← Dashboard
            </Link>
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid rgba(130, 160, 192, 0.18)",
                background: "rgba(11, 21, 32, 0.72)",
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#8fb7d0",
              }}
            >
              {workspaceTemplate}
            </span>
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid rgba(130, 160, 192, 0.18)",
                background: "rgba(11, 21, 32, 0.72)",
                fontSize: 11,
                color: "#7f96aa",
              }}
            >
              {paths.length} fișiere
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "grid", gap: 5 }}>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#6f8aa0",
                }}
              >
                Collaborative Workspace
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#f8fbff" }}>
                {workspaceName}
              </div>
            </div>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 16,
                border: "1px solid rgba(130, 160, 192, 0.16)",
                background: "rgba(11, 21, 32, 0.72)",
                fontSize: 12,
                color: "#8ea7bc",
              }}
            >
              id {shortId(workspaceId)}
            </div>
            <ShareLinkButton
              shareToken={shareToken}
              workspaceName={workspaceName}
            />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 10,
            fontSize: 13,
            opacity: 0.98,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <div
              style={{
                padding: "7px 11px",
                borderRadius: 999,
                border: "1px solid rgba(130, 160, 192, 0.18)",
                background: "rgba(11, 21, 32, 0.72)",
                color: wsConnected ? "#8ee4b8" : "#f2c06a",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {wsConnected ? "Collab live" : "Collab reconnecting"}
            </div>
            <div
              style={{
                padding: "7px 11px",
                borderRadius: 999,
                border: "1px solid rgba(130, 160, 192, 0.18)",
                background: "rgba(11, 21, 32, 0.72)",
                color: synced ? "#8ee4b8" : "#9fd5f7",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {synced ? "Sincronizat" : "Sync în curs"}
            </div>
            <div
              style={{
                padding: "7px 11px",
                borderRadius: 999,
                border: "1px solid rgba(130, 160, 192, 0.18)",
                background: "rgba(11, 21, 32, 0.72)",
                color: aiPresenceWs ? "#d5b8ff" : "#f2c06a",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {aiPresenceWs ? "AI presence live" : "AI presence limited"}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid rgba(130, 160, 192, 0.18)",
                background: "rgba(11, 21, 32, 0.72)",
                color: "#d7e4ef",
              }}
            >
              {currentUser.name} · {currentUser.role}
            </div>
            <button
              onClick={() => {
                void onLogout();
              }}
              style={{
                border: "1px solid rgba(130, 160, 192, 0.22)",
                background: "transparent",
                color: "#e5eef6",
                borderRadius: 12,
                padding: "8px 12px",
                cursor: "pointer",
                fontWeight: 600,
              }}
              type="button"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <CollaboratorStrip peers={peers} aiPresence={aiPresence} />

      {connectionBanners.length > 0 ? (
        <div
          style={{
            display: "grid",
            gap: 10,
            padding: "12px 16px 0",
          }}
        >
          {connectionBanners.map((banner) => (
            <InlineBanner
              key={banner.key}
              tone={banner.tone}
              title={banner.title}
              description={banner.description}
            />
          ))}
        </div>
      ) : null}

      <div
        ref={layoutBodyRef}
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          flexDirection: "column",
          overflow: "hidden",
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
            padding: "14px 16px 0",
            gap: 0,
          }}
        >
          <div
            style={{
              width: leftPanelWidth,
              minWidth: LEFT_PANEL_MIN_WIDTH,
              maxWidth: leftPanelMaxWidth,
              flexShrink: 0,
              minHeight: 0,
              borderRadius: "20px 0 0 0",
              overflow: "hidden",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.18)",
            }}
          >
            <FileTree
              activePath={activePath}
              peerFileColors={peerFileColors}
              onSelect={setActivePath}
              onCreate={handleCreateFile}
              onRename={(path) => {
                setRenameDialog({
                  path,
                  nextPath: path,
                  error: null,
                });
              }}
              onDelete={(path) => {
                setDeletePath(path);
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
              borderTop: "1px solid rgba(130, 160, 192, 0.12)",
              borderBottom: "1px solid rgba(130, 160, 192, 0.12)",
              background: "rgba(6, 12, 19, 0.62)",
              boxShadow: "inset 0 0 0 1px rgba(130, 160, 192, 0.06)",
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
              borderRadius: "0 20px 0 0",
              overflow: "hidden",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.18)",
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
          ariaLabel="Redimensionează panoul inferior (Run / Istoric / Terminal)"
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
            background:
              "linear-gradient(180deg, rgba(9, 15, 23, 0.98) 0%, rgba(7, 12, 20, 0.98) 100%)",
            borderTop: "1px solid rgba(130, 160, 192, 0.12)",
          }}
        >
          <div
            style={{
              flexShrink: 0,
              borderBottom: "1px solid rgba(130, 160, 192, 0.12)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-end",
                gap: 8,
                padding: "10px 12px 0",
              }}
            >
              <div
                role="tablist"
                aria-label="Panou inferior workspace"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
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
                    padding: "10px 15px",
                    fontSize: 13,
                    fontWeight: 700,
                    border: "1px solid transparent",
                    borderRadius: 12,
                    cursor: "pointer",
                    background:
                      bottomTab === "run"
                        ? "linear-gradient(180deg, rgba(15, 74, 109, 0.78), rgba(10, 51, 76, 0.92))"
                        : "transparent",
                    color: bottomTab === "run" ? "#eef9ff" : "#8ea7bc",
                    borderColor:
                      bottomTab === "run"
                        ? "rgba(100, 199, 255, 0.24)"
                        : "rgba(130, 160, 192, 0.14)",
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
                    padding: "10px 15px",
                    fontSize: 13,
                    fontWeight: 700,
                    border: "1px solid transparent",
                    borderRadius: 12,
                    cursor: "pointer",
                    background:
                      bottomTab === "history"
                        ? "linear-gradient(180deg, rgba(15, 74, 109, 0.78), rgba(10, 51, 76, 0.92))"
                        : "transparent",
                    color: bottomTab === "history" ? "#eef9ff" : "#8ea7bc",
                    borderColor:
                      bottomTab === "history"
                        ? "rgba(100, 199, 255, 0.24)"
                        : "rgba(130, 160, 192, 0.14)",
                  }}
                >
                  Istoric & replay
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={bottomTab === "terminal"}
                  id={`${workspaceId}-tab-terminal`}
                  aria-controls={`${workspaceId}-panel-terminal`}
                  onClick={() => {
                    setBottomTab("terminal");
                  }}
                  style={{
                    padding: "10px 15px",
                    fontSize: 13,
                    fontWeight: 700,
                    border: "1px solid transparent",
                    borderRadius: 12,
                    cursor: "pointer",
                    background:
                      bottomTab === "terminal"
                        ? "linear-gradient(180deg, rgba(15, 74, 109, 0.78), rgba(10, 51, 76, 0.92))"
                        : "transparent",
                    color: bottomTab === "terminal" ? "#eef9ff" : "#8ea7bc",
                    borderColor:
                      bottomTab === "terminal"
                        ? "rgba(100, 199, 255, 0.24)"
                        : "rgba(130, 160, 192, 0.14)",
                  }}
                >
                  Terminal
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
                  padding: "10px 15px",
                  fontSize: 13,
                  fontWeight: 700,
                  borderRadius: 12,
                  cursor: manualSaveBusy ? "wait" : "pointer",
                  border: "1px solid rgba(45, 212, 191, 0.26)",
                  background:
                    "linear-gradient(180deg, rgba(16, 104, 99, 0.88), rgba(11, 74, 69, 0.96))",
                  color: "#effffc",
                  opacity: manualSaveBusy ? 0.75 : 1,
                  whiteSpace: "nowrap",
                  marginBottom: 2,
                }}
              >
                {manualSaveBusy
                  ? "Se salvează checkpoint…"
                  : "Salvează checkpoint"}
              </button>
            </div>
          </div>
          {manualSaveHint ? (
            <div style={{ padding: "10px 12px 0", flexShrink: 0 }}>
              <InlineBanner
                tone="success"
                title="Checkpoint pregătit"
                description={manualSaveHint}
                compact={true}
              />
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
              overflow: "hidden",
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
              onRun={async () => {
                await runner.startRun();
              }}
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

          <div
            role="tabpanel"
            id={`${workspaceId}-panel-terminal`}
            aria-labelledby={`${workspaceId}-tab-terminal`}
            hidden={bottomTab !== "terminal"}
            style={{
              flex: 1,
              minHeight: 0,
              display: bottomTab === "terminal" ? "flex" : "none",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <WorkspaceTerminalPanel
              workspaceId={workspaceId}
              currentUserId={currentUser.id}
              currentUserName={currentUser.name}
              wsEnabled={bottomTab === "terminal"}
              onBeforeEnsureSandbox={async () => {
                await persistWorkspaceSnapshotBlocking(
                  workspaceId,
                  Y.encodeStateAsUpdate(ydoc),
                );
              }}
              operatorRunner={{
                startRun: runner.startRun,
                job: runner.job,
                liveLogs: runner.liveLogs,
                streamState: runner.streamState,
                isStarting: runner.isStarting,
                canStart: runner.canStart,
                runError: runner.error,
                templateLabel: workspaceTemplate,
              }}
            />
          </div>
        </div>
      </div>

      <Dialog
        open={renameDialog != null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameDialog(null);
          }
        }}
      >
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleRenameSubmit();
            }}
          >
            <DialogHeader>
              <DialogTitle>Redenumește fișierul</DialogTitle>
              <DialogDescription>
                Mută fișierul într-o cale nouă fără să pierzi conținutul
                colaborativ existent.
              </DialogDescription>
            </DialogHeader>

            <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
              <label
                htmlFor="rename-workspace-path"
                style={{ fontSize: 12, color: "#94a8c4", fontWeight: 600 }}
              >
                Cale nouă
              </label>
              <input
                id="rename-workspace-path"
                data-autofocus="true"
                value={renameDialog?.nextPath ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setRenameDialog((current) =>
                    current
                      ? {
                          ...current,
                          nextPath: value,
                          error: null,
                        }
                      : current,
                  );
                }}
                placeholder="src/main.ts"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  borderRadius: 14,
                  border: "1px solid rgba(130, 160, 192, 0.24)",
                  background: "rgba(8, 14, 22, 0.9)",
                  color: "#e7eef7",
                  padding: "12px 14px",
                }}
              />
              {renameDialog?.error ? (
                <InlineBanner
                  tone="error"
                  title="Redenumire invalidă"
                  description={renameDialog.error}
                  compact={true}
                />
              ) : null}
            </div>

            <DialogFooter>
              <button
                type="button"
                onClick={() => {
                  setRenameDialog(null);
                }}
                style={secondaryActionButtonStyle}
              >
                Anulează
              </button>
              <button type="submit" style={primaryActionButtonStyle}>
                Confirmă redenumirea
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletePath != null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletePath(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ștergi acest fișier?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletePath
                ? `${deletePath} va fi eliminat din workspace pentru toți colaboratorii activi.`
                : "Fișierul selectat va fi eliminat din workspace pentru toți colaboratorii activi."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <button
              type="button"
              onClick={() => {
                setDeletePath(null);
              }}
              style={secondaryActionButtonStyle}
            >
              Păstrează fișierul
            </button>
            <button
              type="button"
              data-autofocus="true"
              onClick={handleDeleteConfirm}
              style={dangerActionButtonStyle}
            >
              Șterge definitiv
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

const secondaryActionButtonStyle: CSSProperties = {
  border: "1px solid rgba(130, 160, 192, 0.24)",
  background: "transparent",
  color: "#c9d7e5",
  borderRadius: 12,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 600,
};

const primaryActionButtonStyle: CSSProperties = {
  border: "1px solid rgba(100, 199, 255, 0.28)",
  background:
    "linear-gradient(180deg, rgba(15, 74, 109, 0.78), rgba(10, 51, 76, 0.92))",
  color: "#d8f0ff",
  borderRadius: 12,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const dangerActionButtonStyle: CSSProperties = {
  border: "1px solid rgba(255, 123, 123, 0.32)",
  background:
    "linear-gradient(180deg, rgba(116, 21, 34, 0.9), rgba(78, 14, 23, 0.98))",
  color: "#ffe0e0",
  borderRadius: 12,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

function useStoredBottomTab(
  key: string,
  fallback: BottomWorkspaceTab,
): readonly [BottomWorkspaceTab, (tab: BottomWorkspaceTab) => void] {
  const [tab, setTab] = useState<BottomWorkspaceTab>(() => {
    if (typeof window === "undefined") {
      return fallback;
    }
    const raw = window.localStorage.getItem(key);
    if (raw === "run" || raw === "history" || raw === "terminal") {
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
