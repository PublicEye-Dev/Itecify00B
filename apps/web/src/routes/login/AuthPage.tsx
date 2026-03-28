import {
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import type { UserDto } from "@itecify/shared/auth";
import { login, signup } from "../../lib/api/authApi.js";
import { ApiClientError } from "../../lib/api/client.js";

type Mode = "login" | "signup";

type AuthPageProps = {
  bootError?: string | null;
  onAuthenticated: (user: UserDto) => void;
};

type FormState = {
  name: string;
  email: string;
  password: string;
};

const demoAccounts = [
  { role: "owner", email: "owner@itecify.demo", password: "DemoPass123!" },
  { role: "editor", email: "editor1@itecify.demo", password: "DemoPass123!" },
  { role: "editor", email: "editor2@itecify.demo", password: "DemoPass123!" },
];

const inputStyle = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid #d0d6e2",
  padding: "12px 14px",
  fontSize: 15,
  background: "#fff",
  color: "#0d1723",
  boxSizing: "border-box" as const,
};

export function AuthPage({
  bootError,
  onAuthenticated,
}: AuthPageProps): ReactNode {
  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState<FormState>({
    name: "",
    email: demoAccounts[0]!.email,
    password: demoAccounts[0]!.password,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(
    bootError ?? null,
  );
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[]> | undefined
  >();
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setFieldErrors(undefined);

    try {
      const response =
        mode === "login"
          ? await login({ email: form.email, password: form.password })
          : await signup({
              name: form.name,
              email: form.email,
              password: form.password,
            });

      onAuthenticated(response.user);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
        setFieldErrors(error.fieldErrors);
      } else {
        console.error("Authentication request failed.", error);
        setErrorMessage("Autentificarea a eșuat. Încearcă din nou.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(circle at top left, rgba(106, 164, 255, 0.22), transparent 34%), linear-gradient(135deg, #08131d 0%, #0f2331 48%, #17384b 100%)",
        fontFamily: '"Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          width: "min(980px, 100%)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          background: "rgba(250, 252, 255, 0.96)",
          borderRadius: 28,
          overflow: "hidden",
          boxShadow: "0 28px 80px rgba(5, 16, 28, 0.34)",
        }}
      >
        <section
          style={{
            padding: "48px 42px",
            color: "#f5f7fb",
            background:
              "linear-gradient(160deg, rgba(9, 22, 34, 0.96) 0%, rgba(16, 44, 65, 0.98) 50%, rgba(26, 80, 106, 0.98) 100%)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              opacity: 0.72,
            }}
          >
            iTECify Security Gate
          </div>
          <h1 style={{ margin: "18px 0 14px", fontSize: 42, lineHeight: 1.05 }}>
            Credentials auth for judge demos and protected workspaces.
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: 440,
              fontSize: 17,
              lineHeight: 1.6,
              opacity: 0.84,
            }}
          >
            Session cookies stay in the browser only, passwords are
            Argon2-hashed server-side, and the workspace APIs now reject
            anonymous access.
          </p>

          <div
            style={{
              marginTop: 28,
              display: "grid",
              gap: 12,
            }}
          >
            {demoAccounts.map((account) => (
              <button
                key={account.email}
                onClick={() => {
                  setMode("login");
                  setForm({
                    name: "",
                    email: account.email,
                    password: account.password,
                  });
                  setErrorMessage(null);
                  setFieldErrors(undefined);
                }}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 16px",
                  borderRadius: 16,
                  border: "1px solid rgba(148, 182, 211, 0.28)",
                  background: "rgba(10, 24, 38, 0.38)",
                  color: "inherit",
                  cursor: "pointer",
                }}
                type="button"
              >
                <span>{account.email}</span>
                <span style={{ opacity: 0.76 }}>{account.role}</span>
              </button>
            ))}
          </div>
        </section>

        <section style={{ padding: "40px 32px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            {(["login", "signup"] as const).map((candidate) => (
              <button
                key={candidate}
                onClick={() => {
                  setMode(candidate);
                  setErrorMessage(null);
                  setFieldErrors(undefined);
                }}
                style={{
                  flex: 1,
                  border: "none",
                  borderRadius: 999,
                  padding: "12px 16px",
                  cursor: "pointer",
                  fontWeight: 700,
                  background: candidate === mode ? "#0d1723" : "#e9eef6",
                  color: candidate === mode ? "#fff" : "#415163",
                }}
                type="button"
              >
                {candidate === "login" ? "Login" : "Signup"}
              </button>
            ))}
          </div>

          <form
            onSubmit={(event) => void handleSubmit(event)}
            style={{ display: "grid", gap: 16 }}
          >
            {mode === "signup" ? (
              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ fontWeight: 600, color: "#253344" }}>
                  Display name
                </span>
                <input
                  name="name"
                  onChange={handleChange}
                  placeholder="Judge Demo"
                  style={inputStyle}
                  value={form.name}
                />
                {fieldErrors?.name ? (
                  <span style={{ color: "#ba2f45", fontSize: 13 }}>
                    {fieldErrors.name.join(" ")}
                  </span>
                ) : null}
              </label>
            ) : null}

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600, color: "#253344" }}>Email</span>
              <input
                autoComplete="username"
                name="email"
                onChange={handleChange}
                placeholder="owner@itecify.demo"
                style={inputStyle}
                value={form.email}
              />
              {fieldErrors?.email ? (
                <span style={{ color: "#ba2f45", fontSize: 13 }}>
                  {fieldErrors.email.join(" ")}
                </span>
              ) : null}
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600, color: "#253344" }}>
                Password
              </span>
              <input
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                name="password"
                onChange={handleChange}
                placeholder="Minimum 8 characters"
                style={inputStyle}
                type="password"
                value={form.password}
              />
              {fieldErrors?.password ? (
                <span style={{ color: "#ba2f45", fontSize: 13 }}>
                  {fieldErrors.password.join(" ")}
                </span>
              ) : null}
            </label>

            {errorMessage ? (
              <div
                style={{
                  borderRadius: 14,
                  padding: "12px 14px",
                  background: "#fff1f3",
                  color: "#8e2030",
                  fontSize: 14,
                }}
              >
                {errorMessage}
              </div>
            ) : null}

            <button
              disabled={isSubmitting}
              style={{
                border: "none",
                borderRadius: 14,
                padding: "14px 18px",
                background: isSubmitting ? "#7d8ca0" : "#0d1723",
                color: "#fff",
                cursor: isSubmitting ? "wait" : "pointer",
                fontWeight: 700,
                fontSize: 15,
              }}
              type="submit"
            >
              {isSubmitting
                ? "Se procesează…"
                : mode === "login"
                  ? "Intră în workspace"
                  : "Creează cont"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
