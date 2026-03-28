import type { CSSProperties, ReactNode } from "react";
import { useWorkspaceCollab } from "../../lib/collab/WorkspaceCollabProvider.js";
import { useYjsFilePaths } from "./useYjsFilePaths.js";

export function FileTree({
  activePath,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  /** Culoare indicator pentru fiecare fișier deschis de alt colaborator (nu tu). */
  peerFileColors,
  style,
}: {
  activePath: string | null;
  onSelect: (path: string) => void;
  onCreate: () => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
  peerFileColors?: Map<string, string>;
  style?: CSSProperties;
}): ReactNode {
  const { files } = useWorkspaceCollab();
  const paths = useYjsFilePaths(files);

  return (
    <aside
      style={{
        width: 260,
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        borderRight: "1px solid #222",
        display: "flex",
        flexDirection: "column",
        background: "#121212",
        color: "#e0e0e0",
        fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        fontSize: 13,
        ...style,
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid #222",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span style={{ fontWeight: 600 }}>Fișiere</span>
        <button
          type="button"
          onClick={onCreate}
          style={{
            cursor: "pointer",
            background: "#2a2a2a",
            color: "#fff",
            border: "1px solid #444",
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: 12,
          }}
        >
          + Nou
        </button>
      </div>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 8,
          overflow: "auto",
          flex: 1,
        }}
      >
        {paths.map((p) => (
          <li key={p} style={{ marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {peerFileColors?.has(p) ? (
                <span
                  title="Alt colaborator are acest fișier deschis"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: peerFileColors.get(p),
                    flexShrink: 0,
                    boxShadow: `0 0 0 1px rgba(0,0,0,0.4)`,
                  }}
                />
              ) : (
                <span style={{ width: 8, flexShrink: 0 }} />
              )}
              <button
                type="button"
                onClick={() => {
                  onSelect(p);
                }}
                style={{
                  flex: 1,
                  textAlign: "left",
                  cursor: "pointer",
                  background: p === activePath ? "#2d4a72" : "transparent",
                  color: "#e8e8e8",
                  border: "none",
                  borderRadius: 4,
                  padding: "6px 8px",
                  font: "inherit",
                }}
              >
                {p}
              </button>
              <button
                type="button"
                title="Redenumește"
                onClick={() => {
                  onRename(p);
                }}
                style={smallIconButton}
              >
                ✎
              </button>
              <button
                type="button"
                title="Șterge"
                onClick={() => {
                  onDelete(p);
                }}
                style={smallIconButton}
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

const smallIconButton: CSSProperties = {
  cursor: "pointer",
  background: "transparent",
  color: "#bbb",
  border: "none",
  borderRadius: 4,
  padding: "2px 6px",
  fontSize: 14,
  lineHeight: 1,
};
