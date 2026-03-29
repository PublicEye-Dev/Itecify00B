import { type CSSProperties, type ReactNode, useState } from "react";
import { computeSuggestionTextDelta } from "@itecify/shared/ai";
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
  const rawOperation = suggestion.operationType ?? "REPLACE";
  const normalizedDelta = computeSuggestionTextDelta(
    rawOperation,
    suggestion.sourceSpanText ?? "",
    rawOperation === "DELETE" ? "" : (suggestion.replacementText ?? ""),
  );
  const op = normalizedDelta.isNoop
    ? rawOperation
    : normalizedDelta.operationType;
  const explanation = suggestion.explanation ?? "";
  const conf =
    suggestion.confidence != null
      ? `${Math.round(suggestion.confidence * 100)}%`
      : "—";

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "flex-start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              color: "#7dd3fc",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
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
            border: "1px solid rgba(130, 160, 192, 0.18)",
            background: "rgba(8, 14, 22, 0.88)",
            color: "#94a8c4",
            borderRadius: 8,
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
          Fișierul s-a schimbat față de snapshot-ul AI. Acceptă doar dacă ești
          sigur sau forțează aplicarea.
        </div>
      ) : null}

      {expanded ? (
        <>
          <p
            style={{
              fontSize: 12,
              color: "#cbd5e1",
              margin: "10px 0 6px",
              lineHeight: 1.45,
            }}
          >
            {explanation}
          </p>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
            Încredere: {conf}
          </div>
          <SuggestionDiffPreview
            operationType={op}
            sourceLabel={normalizedDelta.sourceText}
            replacementLabel={normalizedDelta.replacementText}
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
  padding: "13px 13px 14px",
  borderRadius: 16,
  border: "1px solid rgba(100, 199, 255, 0.18)",
  background:
    "linear-gradient(165deg, rgba(15,22,33,0.98) 0%, rgba(8,12,20,0.98) 100%)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
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
  background:
    "linear-gradient(180deg, rgba(15, 74, 109, 0.78), rgba(10, 51, 76, 0.92))",
  color: "#eef9ff",
  borderColor: "rgba(100, 199, 255, 0.24)",
};

const btnDanger: CSSProperties = {
  ...btnBase,
  background: "transparent",
  color: "#ffb4b4",
  borderColor: "rgba(255, 123, 123, 0.28)",
};

const btnSecondary: CSSProperties = {
  ...btnBase,
  background: "rgba(8, 14, 22, 0.92)",
  color: "#e2e8f0",
  borderColor: "rgba(130, 160, 192, 0.16)",
};

const btnWarn: CSSProperties = {
  ...btnBase,
  background: "rgba(180, 83, 9, 0.28)",
  color: "#fef3c7",
  borderColor: "rgba(246, 196, 83, 0.24)",
};
