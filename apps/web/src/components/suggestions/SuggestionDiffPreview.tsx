import type { ReactNode } from "react";
import type { SuggestionOperationType } from "@itecify/shared/ai";

export function SuggestionDiffPreview({
  operationType,
  sourceLabel,
  replacementLabel,
}: {
  operationType: SuggestionOperationType;
  sourceLabel: string;
  replacementLabel: string;
}): ReactNode {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 6,
        fontSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      <div style={{ color: "#94a3b8", fontWeight: 600 }}>
        {operationType === "INSERT" ? "—" : "Înainte (snapshot)"}
      </div>
      <div style={{ color: "#c4b5fd", fontWeight: 600 }}>După (AI)</div>
      <pre
        style={{
          margin: 0,
          padding: 8,
          borderRadius: 6,
          background: "rgba(15,23,42,0.9)",
          border: "1px solid #334155",
          color: "#e2e8f0",
          maxHeight: 120,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {operationType === "INSERT" ? "∅" : sourceLabel || "—"}
      </pre>
      <pre
        style={{
          margin: 0,
          padding: 8,
          borderRadius: 6,
          background: "rgba(46, 16, 101, 0.35)",
          border: "1px solid #6d28d9",
          color: "#ede9fe",
          maxHeight: 120,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {operationType === "DELETE" ? "∅" : replacementLabel || "—"}
      </pre>
    </div>
  );
}
