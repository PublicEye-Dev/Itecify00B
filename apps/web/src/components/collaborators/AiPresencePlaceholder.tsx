import type { CSSProperties, ReactNode } from "react";
import "../../features/editor/yMonacoRemote.css";

/**
 * Prezență AI sintetică (nu e în Yjs) — diferențiere vizuală clară față de oameni.
 * Phase 2: înlocuit cu stare reală din serviciu.
 */
export function AiPresencePlaceholder(): ReactNode {
  return (
    <div
      style={aiCard}
      title="Placeholder Phase 2: sugestii AI și agenți"
    >
      <div style={aiOrb} aria-hidden>
        <span className="itecify-ai-pulse-dot" />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#c4b5fd" }}>AI</div>
        <div style={{ fontSize: 11, color: "#9ca3af" }}>Standby · gata de asistare</div>
      </div>
    </div>
  );
}

const aiCard: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px",
  borderRadius: 10,
  border: "1px dashed rgba(139, 92, 246, 0.55)",
  background: "linear-gradient(135deg, rgba(76, 29, 149, 0.35) 0%, rgba(15, 23, 42, 0.9) 100%)",
  flexShrink: 0,
};

const aiOrb: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 999,
  background: "linear-gradient(145deg, #a78bfa 0%, #6366f1 100%)",
  display: "grid",
  placeItems: "center",
  position: "relative",
  overflow: "hidden",
};
