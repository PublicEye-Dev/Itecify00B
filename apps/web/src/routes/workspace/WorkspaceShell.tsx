import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import type { UserDto } from "@itecify/shared/auth";
import type { WorkspacePublicDto } from "@itecify/shared/workspaces";
import { WorkspaceCollabLayout } from "../../features/files/WorkspaceCollabLayout.js";
import { WorkspaceCollabProvider } from "../../lib/collab/WorkspaceCollabProvider.js";
import { getWorkspace } from "../../lib/api/workspaceApi.js";

export function WorkspaceShell({
  currentUser,
  onLogout,
}: {
  currentUser: UserDto;
  onLogout: () => Promise<void>;
}): ReactNode {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [phase, setPhase] = useState<"loading" | "ok" | "error">("loading");
  const [workspace, setWorkspace] = useState<WorkspacePublicDto | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    setPhase("loading");
    let cancelled = false;
    void (async () => {
      try {
        const { workspace: w } = await getWorkspace(workspaceId);
        if (!cancelled) {
          setWorkspace(w);
          setPhase("ok");
        }
      } catch {
        if (!cancelled) {
          setWorkspace(null);
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  if (!workspaceId) {
    return <Navigate to="/" replace />;
  }

  if (phase === "loading") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#1e1e1e",
          color: "#ddd",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Se încarcă workspace…
      </div>
    );
  }

  if (phase === "error" || !workspace) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#1e1e1e",
          color: "#f87171",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div>
          <p>Nu am putut încărca workspace-ul (lipsă drepturi sau ID invalid).</p>
          <Link to="/" style={{ color: "#93c5fd" }}>
            ← Înapoi la dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceCollabProvider workspaceId={workspaceId}>
      <WorkspaceCollabLayout
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        shareToken={workspace.shareToken}
        workspaceTemplate={workspace.template}
        currentUser={currentUser}
        onLogout={onLogout}
      />
    </WorkspaceCollabProvider>
  );
}
