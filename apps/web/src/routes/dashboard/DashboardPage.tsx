import {
  type FormEvent,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { UserDto } from "@itecify/shared/auth";
import type {
  WorkspacePublicDto,
  WorkspaceTemplateDto,
} from "@itecify/shared/workspaces";
import {
  createWorkspace,
  joinWorkspace,
  listWorkspaces,
} from "../../lib/api/workspaceApi.js";

const templates: { value: WorkspaceTemplateDto; label: string }[] = [
  { value: "javascript", label: "JavaScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "c", label: "C" },
];

export function DashboardPage({
  currentUser,
  onLogout,
}: {
  currentUser: UserDto;
  onLogout: () => void;
}): ReactNode {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<WorkspacePublicDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("Proiect nou");
  const [template, setTemplate] = useState<WorkspaceTemplateDto>("javascript");
  const [shareToken, setShareToken] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const tokenFromUrl = searchParams.get("join")?.trim();
    if (tokenFromUrl) {
      setShareToken(tokenFromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { workspaces } = await listWorkspaces();
        if (!cancelled) {
          setItems(workspaces);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Nu am putut încărca workspace-urile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { workspace } = await createWorkspace({ name, template });
      navigate(`/workspace/${workspace.id}`);
    } catch {
      setError("Crearea workspace-ului a eșuat.");
    } finally {
      setBusy(false);
    }
  }

  async function onJoin(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { workspace } = await joinWorkspace({ shareToken: shareToken.trim() });
      navigate(`/workspace/${workspace.id}`);
    } catch {
      setError("Nu te-am putut alătura (link invalid sau deja membru).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #0f172a 0%, #1e293b 100%)",
        color: "#e2e8f0",
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
      }}
    >
      <header
        style={{
          marginBottom: "2rem",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.75rem" }}>iTECify — workspace-uri</h1>
          <p style={{ opacity: 0.85, marginTop: 8 }}>
            Creează un workspace cu șablon de limbă sau intră cu link de share.
          </p>
        </div>
        <div style={{ fontSize: 14, textAlign: "right" }}>
          <div style={{ opacity: 0.9 }}>{currentUser.email}</div>
          <button
            type="button"
            onClick={onLogout}
            style={{
              marginTop: 8,
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid #64748b",
              background: "transparent",
              color: "#e2e8f0",
              cursor: "pointer",
            }}
          >
            Deconectare
          </button>
        </div>
      </header>

      {error ? (
        <p style={{ color: "#fca5a5", marginBottom: "1rem" }}>{error}</p>
      ) : null}

      <div
        style={{
          display: "grid",
          gap: "2rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          maxWidth: 960,
        }}
      >
        <section
          style={{
            background: "rgba(15,23,42,0.6)",
            borderRadius: 12,
            padding: "1.25rem",
            border: "1px solid #334155",
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Workspace nou</h2>
          <form onSubmit={(e) => void onCreate(e)} style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 4 }}>
              Nume
              <input
                value={name}
                onChange={(ev) => setName(ev.target.value)}
                required
                style={inputStyle}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              Șablon limbă
              <select
                value={template}
                onChange={(ev) =>
                  setTemplate(ev.target.value as WorkspaceTemplateDto)
                }
                style={inputStyle}
              >
                {templates.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={busy} style={btnStyle}>
              Creează și deschide
            </button>
          </form>
        </section>

        <section
          style={{
            background: "rgba(15,23,42,0.6)",
            borderRadius: 12,
            padding: "1.25rem",
            border: "1px solid #334155",
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Intră cu link</h2>
          <form onSubmit={(e) => void onJoin(e)} style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 4 }}>
              Token share (din URL)
              <input
                value={shareToken}
                onChange={(ev) => setShareToken(ev.target.value)}
                placeholder="lipește token-ul"
                required
                style={inputStyle}
              />
            </label>
            <button type="submit" disabled={busy} style={btnStyle}>
              Alătură-te
            </button>
          </form>
        </section>
      </div>

      <section style={{ marginTop: "2.5rem", maxWidth: 960 }}>
        <h2 style={{ fontSize: "1.1rem" }}>Workspace-urile tale</h2>
        {loading ? (
          <p style={{ opacity: 0.8 }}>Se încarcă…</p>
        ) : items.length === 0 ? (
          <p style={{ opacity: 0.8 }}>Niciun workspace încă.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((w) => (
              <li
                key={w.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 0",
                  borderBottom: "1px solid #334155",
                  gap: 12,
                }}
              >
                <div>
                  <strong>{w.name}</strong>
                  <span style={{ opacity: 0.75, marginLeft: 8 }}>
                    · {w.template} · {w.role}
                  </span>
                  <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>
                    Share: <code>{w.shareToken}</code>
                  </div>
                </div>
                <Link
                  to={`/workspace/${w.id}`}
                  style={{ color: "#93c5fd", textDecoration: "none", fontWeight: 600 }}
                >
                  Deschide →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const inputStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #475569",
  background: "#0f172a",
  color: "#f1f5f9",
};

const btnStyle: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};
