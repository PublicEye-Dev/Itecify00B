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
import { useToast } from "../../components/ui/toast.js";

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
  const { toast } = useToast();
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
      toast({
        title: "Workspace creat",
        description: `${workspace.name} este pregătit pentru colaborare.`,
        tone: "success",
      });
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
      const { workspace } = await joinWorkspace({
        shareToken: shareToken.trim(),
      });
      toast({
        title: "Ai intrat în workspace",
        description: `Te conectez la ${workspace.name}.`,
        tone: "success",
      });
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
        background:
          "radial-gradient(circle at top left, rgba(100, 199, 255, 0.12), transparent 26%), linear-gradient(160deg, #09111a 0%, #101926 100%)",
        color: "#e2e8f0",
        fontFamily: '"Aptos", "Segoe UI", sans-serif',
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
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 999,
              border: "1px solid rgba(130, 160, 192, 0.22)",
              padding: "6px 12px",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#8fb7d0",
              background: "rgba(8, 14, 22, 0.42)",
            }}
          >
            iTECify Workspace Hub
          </div>
          <h1 style={{ margin: "14px 0 0", fontSize: "2rem" }}>
            Creezi, intri și continui sesiunea de colaborare.
          </h1>
          <p
            style={{
              opacity: 0.82,
              marginTop: 10,
              maxWidth: 620,
              lineHeight: 1.6,
            }}
          >
            Dashboard-ul păstrează intrările esențiale aproape: creare rapidă,
            join din link și lista workspace-urilor active pentru demo.
          </p>
        </div>
        <div
          style={{
            fontSize: 14,
            textAlign: "right",
            padding: "14px 16px",
            borderRadius: 18,
            border: "1px solid rgba(130, 160, 192, 0.18)",
            background: "rgba(8, 14, 22, 0.42)",
            minWidth: 220,
          }}
        >
          <div
            style={{
              opacity: 0.68,
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Sesiune activă
          </div>
          <div style={{ opacity: 0.96, marginTop: 6 }}>{currentUser.email}</div>
          <button
            type="button"
            onClick={onLogout}
            style={{
              marginTop: 12,
              padding: "8px 14px",
              borderRadius: 12,
              border: "1px solid rgba(130, 160, 192, 0.22)",
              background: "transparent",
              color: "#e2e8f0",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Deconectare
          </button>
        </div>
      </header>

      {error ? (
        <p
          style={{
            color: "#fca5a5",
            marginBottom: "1rem",
            border: "1px solid rgba(255, 123, 123, 0.2)",
            background: "rgba(55, 20, 25, 0.42)",
            borderRadius: 16,
            padding: "12px 14px",
            maxWidth: 960,
          }}
        >
          {error}
        </p>
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
            background: "rgba(9, 16, 25, 0.78)",
            borderRadius: 20,
            padding: "1.35rem",
            border: "1px solid rgba(130, 160, 192, 0.18)",
            boxShadow: "0 18px 48px rgba(0, 0, 0, 0.18)",
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>Workspace nou</h2>
          <p
            style={{
              marginTop: 8,
              marginBottom: 16,
              fontSize: 13,
              color: "#8fa4ba",
              lineHeight: 1.5,
            }}
          >
            Creează rapid un sandbox pornind de la șablonul limbii de concurs.
          </p>
          <form
            onSubmit={(e) => void onCreate(e)}
            style={{ display: "grid", gap: 12 }}
          >
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
            background: "rgba(9, 16, 25, 0.78)",
            borderRadius: 20,
            padding: "1.35rem",
            border: "1px solid rgba(130, 160, 192, 0.18)",
            boxShadow: "0 18px 48px rgba(0, 0, 0, 0.18)",
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>Intră cu link</h2>
          <p
            style={{
              marginTop: 8,
              marginBottom: 16,
              fontSize: 13,
              color: "#8fa4ba",
              lineHeight: 1.5,
            }}
          >
            Pentru demo-uri live, pastează tokenul de share și intri direct în
            sesiunea comună.
          </p>
          <form
            onSubmit={(e) => void onJoin(e)}
            style={{ display: "grid", gap: 12 }}
          >
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
        <h2 style={{ fontSize: "1.15rem" }}>Workspace-urile tale</h2>
        {loading ? (
          <p style={{ opacity: 0.8, color: "#9fb0c2" }}>
            Se încarcă workspace-urile…
          </p>
        ) : items.length === 0 ? (
          <div
            style={{
              borderRadius: 18,
              border: "1px dashed rgba(130, 160, 192, 0.22)",
              padding: "18px 20px",
              color: "#9fb0c2",
              background: "rgba(8, 14, 22, 0.3)",
            }}
          >
            Nu există workspace-uri încă. Creează unul nou sau intră din link
            pentru a porni demo-ul.
          </div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((w) => (
              <li
                key={w.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 0",
                  borderBottom: "1px solid rgba(130, 160, 192, 0.14)",
                  gap: 12,
                }}
              >
                <div>
                  <strong>{w.name}</strong>
                  <span
                    style={{ opacity: 0.75, marginLeft: 8, color: "#9fb0c2" }}
                  >
                    · {w.template} · {w.role}
                  </span>
                  <div
                    style={{
                      fontSize: 12,
                      opacity: 0.7,
                      marginTop: 6,
                      color: "#88a0b7",
                    }}
                  >
                    Share: <code>{w.shareToken}</code>
                  </div>
                </div>
                <Link
                  to={`/workspace/${w.id}`}
                  style={{
                    color: "#b9e6ff",
                    textDecoration: "none",
                    fontWeight: 700,
                  }}
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
  padding: "11px 12px",
  borderRadius: 12,
  border: "1px solid rgba(130, 160, 192, 0.22)",
  background: "rgba(7, 14, 22, 0.92)",
  color: "#f1f5f9",
};

const btnStyle: CSSProperties = {
  padding: "11px 16px",
  borderRadius: 12,
  border: "1px solid rgba(100, 199, 255, 0.22)",
  background:
    "linear-gradient(180deg, rgba(16, 94, 146, 0.95), rgba(12, 70, 110, 0.98))",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};
