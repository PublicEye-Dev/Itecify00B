import { useEffect, useState, type ReactNode } from "react";
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
          background:
            "radial-gradient(circle at top, rgba(100, 199, 255, 0.12), transparent 28%), linear-gradient(180deg, #09111a 0%, #0d151f 100%)",
          color: "#ddd",
          fontFamily: '"Aptos", "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            minWidth: 280,
            padding: "22px 24px",
            borderRadius: 22,
            border: "1px solid rgba(130, 160, 192, 0.16)",
            background: "rgba(8, 14, 22, 0.72)",
            boxShadow: "0 24px 60px rgba(0,0,0,0.24)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#8fb7d0",
            }}
          >
            Workspace Session
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 24,
              fontWeight: 700,
              color: "#f8fbff",
            }}
          >
            Se încarcă workspace-ul…
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 13,
              color: "#95a8bc",
              lineHeight: 1.55,
            }}
          >
            Refacem snapshot-ul colaborativ, prezența live și suprafețele
            editorului.
          </div>
        </div>
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
          background:
            "radial-gradient(circle at top, rgba(255, 123, 123, 0.1), transparent 24%), linear-gradient(180deg, #09111a 0%, #0d151f 100%)",
          color: "#f87171",
          fontFamily: '"Aptos", "Segoe UI", sans-serif',
          textAlign: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 420,
            padding: "24px 26px",
            borderRadius: 22,
            border: "1px solid rgba(255, 123, 123, 0.18)",
            background: "rgba(30, 11, 16, 0.38)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#f4b0b0",
            }}
          >
            Workspace unavailable
          </div>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
            Nu am putut încărca workspace-ul. Cel mai probabil linkul nu mai
            este valid sau contul nu are acces.
          </p>
          <Link to="/" style={{ color: "#a8defd", fontWeight: 700 }}>
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
