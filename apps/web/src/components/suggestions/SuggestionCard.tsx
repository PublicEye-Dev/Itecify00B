import { type CSSProperties, type ReactNode, useState } from "react";
import type { AiSuggestionPersisted } from "@itecify/shared/ai";
import { SuggestionDiffPreview } from "./SuggestionDiffPreview.js";

export function SuggestionCard({
  suggestion,
  showConflict,
  busy,
  onOpenInEditor,
  onAccept,
  onReject,
  onForceAccept,
}: {
  suggestion: AiSuggestionPersisted;
  showConflict: boolean;
  busy: boolean;
  onOpenInEditor: () => void;
  onAccept: () => void;
  onReject: () => void;
  onForceAccept: () => void;
}): ReactNode {
  const [expanded, setExpanded] = useState(true);
  const op = suggestion.operationType ?? "REPLACE";
  const explanation = suggestion.explanation ?? "";
  const conf =
    suggestion.confidence != null
      ? `${Math.round(suggestion.confidence * 100)}%`
      : "—";

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "#a78bfa", fontWeight: 700, letterSpacing: "0.04em" }}>
            AI · {op}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#e2e8f0",
              fontWeight: 600,
              marginTop: 4,
              wordBreak: "break-word",
            }}
          >
            {suggestion.filePath ?? "—"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{
            flexShrink: 0,
            fontSize: 11,
            border: "1px solid #475569",
            background: "#1e293b",
            color: "#94a3b8",
            borderRadius: 6,
            padding: "4px 8px",
            cursor: "pointer",
          }}
        >
          {expanded ? "Restrânge" : "Detalii"}
        </button>
      </div>

      {showConflict ? (
        <div
          style={{
            marginTop: 8,
            padding: "8px 10px",
            borderRadius: 8,
            background: "rgba(180, 83, 9, 0.25)",
            border: "1px solid #b45309",
            color: "#fde68a",
            fontSize: 12,
          }}
        >
          Fișierul s-a schimbat față de snapshot-ul AI. Acceptă doar dacă ești sigur sau forțează
          aplicarea.
        </div>
      ) : null}

      {expanded ? (
        <>
          <p style={{ fontSize: 12, color: "#cbd5e1", margin: "10px 0 6px", lineHeight: 1.45 }}>
            {explanation}
          </p>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>Încredere: {conf}</div>
          <SuggestionDiffPreview
            operationType={op}
            sourceLabel={suggestion.sourceSpanText ?? ""}
            replacementLabel={
              op === "DELETE" ? "" : (suggestion.replacementText ?? "")
            }
          />
        </>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          disabled={busy}
          onClick={onOpenInEditor}
          style={btnSecondary}
        >
          Deschide în editor
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onReject}
          style={btnDanger}
        >
          Respinge
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onAccept}
          style={btnPrimary}
        >
          Acceptă
        </button>
        {showConflict ? (
          <button
            type="button"
            disabled={busy}
            onClick={onForceAccept}
            style={btnWarn}
          >
            Forțează acceptarea
          </button>
        ) : null}
      </div>
    </div>
  );
}

const cardStyle: CSSProperties = {
  padding: "12px 12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(109, 40, 217, 0.45)",
  background: "linear-gradient(165deg, rgba(30,27,46,0.98) 0%, rgba(15,17,28,0.98) 100%)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
};

const btnBase: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  padding: "6px 12px",
  cursor: "pointer",
  border: "1px solid transparent",
};

const btnPrimary: CSSProperties = {
  ...btnBase,
  background: "linear-gradient(180deg, #5b21b6, #4c1d95)",
  color: "#f5f3ff",
  borderColor: "#7c3aed",
};

const btnDanger: CSSProperties = {
  ...btnBase,
  background: "transparent",
  color: "#fca5a5",
  borderColor: "#7f1d1d",
};

const btnSecondary: CSSProperties = {
  ...btnBase,
  background: "#1e293b",
  color: "#e2e8f0",
  borderColor: "#475569",
};

const btnWarn: CSSProperties = {
  ...btnBase,
  background: "rgba(180, 83, 9, 0.35)",
  color: "#fef3c7",
  borderColor: "#b45309",
};
