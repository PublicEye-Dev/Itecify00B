import type { CSSProperties, ReactNode } from "react";
import "../../features/editor/yMonacoRemote.css";
import type { AiPresenceUpdate } from "@itecify/shared/ai";
import type { CollabPeerView } from "../../lib/collab/awarenessTypes.js";

function initial(name: string): string {
  const t = name.trim();
  return t.length > 0 ? t[0]!.toUpperCase() : "?";
}

function labelForAiStatus(status: AiPresenceUpdate["status"]): string {
  switch (status) {
    case "standby":
      return "Standby";
    case "thinking":
      return "Thinking";
    case "generating":
      return "Generating";
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export function CollaboratorStrip({
  peers,
  aiPresence,
}: {
  peers: CollabPeerView[];
  aiPresence: AiPresenceUpdate | null;
}): ReactNode {
  const humans = peers.filter((p) => p.kind === "human");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderBottom: "1px solid #2a2a2a",
        background: "linear-gradient(180deg, #1a1f2e 0%, #141820 100%)",
        overflowX: "auto",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 11, letterSpacing: "0.06em", color: "#8b9cb3", flexShrink: 0 }}>
        LIVE
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
        {humans.map((p) => (
          <div
            key={p.clientId}
            title={p.activeFile ? `Fișier: ${p.activeFile}` : p.name}
            style={cardStyle}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                background: p.color,
                color: "#0a0e14",
                display: "grid",
                placeItems: "center",
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
                boxShadow: `0 0 0 2px #0d1117, 0 0 0 4px ${p.color}55`,
              }}
            >
              {initial(p.name)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#e8edf0",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {p.name}
                {p.isSelf ? (
                  <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500, color: "#7dd3a0" }}>
                    (tu)
                  </span>
                ) : null}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#7a8a9e",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {p.activeFile ? `📄 ${p.activeFile}` : "Fără fișier activ"}
              </div>
            </div>
          </div>
        ))}
        {aiPresence ? (
          <div
            title={
              aiPresence.filePath
                ? `AI · ${labelForAiStatus(aiPresence.status)} · ${aiPresence.filePath}`
                : `AI · ${labelForAiStatus(aiPresence.status)}`
            }
            style={aiCardStyle}
          >
            <div style={aiOrb} aria-hidden>
              <span className="itecify-ai-pulse-dot" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#c4b5fd",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {aiPresence.displayName}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#a78bfa",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {labelForAiStatus(aiPresence.status)}
                {aiPresence.filePath ? ` · ${aiPresence.filePath}` : ""}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const cardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid #2f3d52",
  background: "rgba(20,28,40,0.85)",
  flexShrink: 0,
  maxWidth: 220,
};

const aiCardStyle: CSSProperties = {
  ...cardStyle,
  border: "1px solid #4c3d7a",
  background: "rgba(36, 24, 58, 0.9)",
  maxWidth: 240,
};

const aiOrb: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 999,
  background: "linear-gradient(145deg, #6d28d9, #4c1d95)",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
  boxShadow: "0 0 0 2px #0d1117, 0 0 12px rgba(139, 92, 246, 0.45)",
};
