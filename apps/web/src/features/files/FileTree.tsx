import type { CSSProperties, ReactNode } from "react";
import { useWorkspaceCollab } from "../../lib/collab/WorkspaceCollabProvider.js";
import { useYjsFilePaths } from "./useYjsFilePaths.js";

function splitPathLabel(path: string): {
  fileName: string;
  parentPath: string;
} {
  const parts = path.split("/");
  const fileName = parts.pop() ?? path;
  return {
    fileName,
    parentPath: parts.join("/"),
  };
}

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
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        borderRight: "1px solid rgba(130, 160, 192, 0.14)",
        display: "flex",
        flexDirection: "column",
        background:
          "linear-gradient(180deg, rgba(13, 18, 26, 0.98) 0%, rgba(9, 14, 22, 0.98) 100%)",
        color: "#e0e0e0",
        fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
        fontSize: 13,
        ...style,
      }}
    >
      <div
        style={{
          padding: "14px 14px 12px",
          borderBottom: "1px solid rgba(130, 160, 192, 0.14)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <span
            style={{
              fontWeight: 700,
              color: "#f2f7fd",
              letterSpacing: "0.04em",
            }}
          >
            Fișiere
          </span>
          <span style={{ fontSize: 11, color: "#6f869c" }}>
            {paths.length} în workspace
          </span>
        </div>
        <button
          type="button"
          onClick={onCreate}
          style={{
            cursor: "pointer",
            background:
              "linear-gradient(180deg, rgba(15, 74, 109, 0.78), rgba(10, 51, 76, 0.92))",
            color: "#eef9ff",
            border: "1px solid rgba(100, 199, 255, 0.26)",
            borderRadius: 10,
            padding: "7px 10px",
            fontSize: 12,
            fontWeight: 700,
            boxShadow: "0 8px 18px rgba(8, 26, 40, 0.24)",
          }}
        >
          + Nou
        </button>
      </div>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 10,
          overflow: "auto",
          flex: 1,
        }}
      >
        {paths.length === 0 ? (
          <li
            style={{
              borderRadius: 16,
              border: "1px dashed rgba(130, 160, 192, 0.2)",
              padding: "16px 14px",
              color: "#7f96aa",
              lineHeight: 1.55,
            }}
          >
            Nu există fișiere încă. Creează unul nou ca să pornești editorul
            colaborativ.
          </li>
        ) : (
          paths.map((p) => {
            const { fileName, parentPath } = splitPathLabel(p);
            const active = p === activePath;

            return (
              <li key={p} style={{ marginBottom: 6 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "stretch",
                    gap: 6,
                    borderRadius: 14,
                    border: active
                      ? "1px solid rgba(100, 199, 255, 0.22)"
                      : "1px solid transparent",
                    background: active
                      ? "linear-gradient(180deg, rgba(17, 39, 57, 0.95), rgba(10, 19, 29, 0.98))"
                      : "transparent",
                    padding: 4,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(p);
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      textAlign: "left",
                      cursor: "pointer",
                      background: "transparent",
                      color: "#e8e8e8",
                      border: "none",
                      borderRadius: 10,
                      padding: "9px 10px",
                      font: "inherit",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      {peerFileColors?.has(p) ? (
                        <span
                          title="Alt colaborator are acest fișier deschis"
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: peerFileColors.get(p),
                            flexShrink: 0,
                            boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            flexShrink: 0,
                            background: active
                              ? "#64c7ff"
                              : "rgba(130, 160, 192, 0.24)",
                          }}
                        />
                      )}
                      <div style={{ minWidth: 0, display: "grid", gap: 3 }}>
                        <span
                          style={{
                            color: active ? "#f7fbff" : "#d8e3ef",
                            fontSize: 12,
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {fileName}
                        </span>
                        <span
                          style={{
                            color: active ? "#8fc7eb" : "#667f95",
                            fontSize: 10,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {parentPath || "workspace root"}
                        </span>
                      </div>
                    </div>
                  </button>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      paddingRight: 2,
                    }}
                  >
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
                </div>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}

const smallIconButton: CSSProperties = {
  cursor: "pointer",
  background: "rgba(12, 19, 28, 0.92)",
  color: "#9bb1c6",
  border: "1px solid rgba(130, 160, 192, 0.16)",
  borderRadius: 8,
  padding: "5px 7px",
  fontSize: 13,
  lineHeight: 1,
};
