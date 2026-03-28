import type { CSSProperties, ReactNode } from "react";
import type { CollabPeerView } from "../../lib/collab/awarenessTypes.js";
import { AiPresencePlaceholder } from "./AiPresencePlaceholder.js";

function initial(name: string): string {
  const t = name.trim();
  return t.length > 0 ? t[0]!.toUpperCase() : "?";
}

export function CollaboratorStrip({ peers }: { peers: CollabPeerView[] }): ReactNode {
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
              <div style={{ fontSize: 13, fontWeight: 600, color: "#e8edf0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
      </div>
      <AiPresencePlaceholder />
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
