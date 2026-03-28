import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { UserDto } from "@itecify/shared/auth";
import type { WorkspaceTemplateDto } from "@itecify/shared/workspaces";
import * as Y from "yjs";
import {
  useCollabConnectionStatus,
  useWorkspaceCollab,
} from "../../lib/collab/WorkspaceCollabProvider.js";
import { persistWorkspaceSnapshotBlocking } from "../../lib/collab/snapshotApi.js";
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
  workspaceTemplate,
  currentUser,
  onLogout,
}: {
  workspaceId: string;
  workspaceTemplate: WorkspaceTemplateDto;
  currentUser: UserDto;
  onLogout: () => Promise<void>;
}): ReactNode {
  const { ydoc, provider, files } = useWorkspaceCollab();
  const { wsConnected, synced } = useCollabConnectionStatus();
  const paths = useYjsFilePaths(files);
  const [activePath, setActivePath] = useState<string | null>(null);

  useEffect(() => {
    if (paths.length === 0) {
      setActivePath(null);
      return;
    }
    if (!activePath || !files.has(activePath)) {
      setActivePath(paths[0]!);
    }
  }, [paths, activePath, files]);

  const ytext = useMemo(
    () => (activePath ? (files.get(activePath) ?? null) : null),
    [activePath, files],
  );
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
            onSelect={setActivePath}
            onCreate={() => {
              const p = createUntitledFile(ydoc);
              setActivePath(p);
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
            awareness={provider.awareness}
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
