import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
import { persistWorkspaceSnapshotBlocking } from "../../lib/collab/snapshotApi.js";
import { useWorkspaceAiPresence } from "../../lib/collab/useWorkspaceAiPresence.js";
import { CollabMonacoEditor } from "../editor/CollabMonacoEditor.js";
import { RunPanel } from "../run/RunPanel.js";
import { useWorkspaceRun } from "../run/useWorkspaceRun.js";
import { FileTree } from "./FileTree.js";
import {
  createUntitledFile,
  deleteFile,
  renameFile,
} from "./workspaceFileOps.js";
import { useYjsFilePaths } from "./useYjsFilePaths.js";

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
  const [activePath, setActivePath] = useState<string | null>(null);
  const [pendingSuggestions, setPendingSuggestions] = useState<
    AiSuggestionPersisted[]
  >([]);
  const [revealRequest, setRevealRequest] = useState<{
    range: TargetRange;
    key: number;
  } | null>(null);
  const revealKeyRef = useRef(0);
  const paths = useYjsFilePaths(files);

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

  const runner = useWorkspaceRun({
    workspaceId,
    template: workspaceTemplate,
    persistSnapshot: async () => {
      await persistWorkspaceSnapshotBlocking(
        workspaceId,
        Y.encodeStateAsUpdate(ydoc),
      );
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
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
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
          />
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
          />
        </div>

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
    </div>
  );
}
