import { useEffect, useState, type ReactNode } from "react";
import type { UserDto } from "@itecify/shared/auth";
import { WorkspaceCollabLayout } from "./features/files/WorkspaceCollabLayout.js";
import { getCurrentUser, logout } from "./lib/api/authApi.js";
import { ApiClientError } from "./lib/api/client.js";
import { WorkspaceCollabProvider } from "./lib/collab/WorkspaceCollabProvider.js";
import { AuthPage } from "./routes/login/AuthPage.js";
import { useWorkspaceId } from "./useWorkspaceId.js";

export function App(): ReactNode {
  const workspaceId = useWorkspaceId();
  const [currentUser, setCurrentUser] = useState<UserDto | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await getCurrentUser();
        if (!cancelled) {
          setCurrentUser(response.user);
          setBootstrapError(null);
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiClientError && error.statusCode === 401) {
          setCurrentUser(null);
          setBootstrapError(null);
        } else {
          console.error("Failed to restore authenticated session.", error);
          setCurrentUser(null);
          setBootstrapError("API-ul de autentificare nu răspunde momentan.");
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (isBootstrapping) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "radial-gradient(circle at top, #1f3447 0%, #09111a 60%)",
          color: "#f5f7fb",
          fontFamily: '"Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontSize: 13,
          }}
        >
          Se inițializează sesiunea…
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthPage
        bootError={bootstrapError}
        onAuthenticated={(user) => {
          setCurrentUser(user);
          setBootstrapError(null);
        }}
      />
    );
  }

  async function handleLogout(): Promise<void> {
    try {
      await logout();
      setCurrentUser(null);
    } catch (error) {
      console.error("Logout failed.", error);
      window.alert("Logout-ul a eșuat. Încearcă din nou.");
    }
  }

  return (
    <WorkspaceCollabProvider workspaceId={workspaceId}>
      <WorkspaceCollabLayout
        currentUser={currentUser}
        onLogout={handleLogout}
        workspaceId={workspaceId}
      />
    </WorkspaceCollabProvider>
  );
}
