import { useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { UserDto } from "@itecify/shared/auth";
import { getCurrentUser, logout } from "./lib/api/authApi.js";
import { ApiClientError } from "./lib/api/client.js";
import { useToast } from "./components/ui/toast.js";
import { AuthPage } from "./routes/login/AuthPage.js";
import { DashboardPage } from "./routes/dashboard/DashboardPage.js";
import { WorkspaceShell } from "./routes/workspace/WorkspaceShell.js";

export function App(): ReactNode {
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<UserDto | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await getCurrentUser();
        if (!cancelled) {
          setCurrentUser(response.user ?? null);
          setBootstrapError(null);
        }
      } catch (error) {
        if (cancelled) return;
        if (!(error instanceof ApiClientError && error.statusCode === 401)) {
          console.error("Failed to restore authenticated session.", error);
          setBootstrapError("API-ul de autentificare nu răspunde momentan.");
        }
        setCurrentUser(null);
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
      toast({
        title: "Logout-ul a eșuat",
        description: "Sesiunea nu a putut fi închisă acum. Încearcă din nou.",
        tone: "error",
      });
    }
  }

  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route
          path="/"
          element={
            <DashboardPage
              currentUser={currentUser}
              onLogout={() => void handleLogout()}
            />
          }
        />
        <Route
          path="/workspace/:workspaceId"
          element={
            <WorkspaceShell currentUser={currentUser} onLogout={handleLogout} />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
