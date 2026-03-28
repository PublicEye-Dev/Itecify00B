import { useCallback, useState, type ReactNode } from "react";

export function ShareLinkButton({
  shareToken,
  workspaceName,
}: {
  shareToken: string;
  workspaceName: string;
}): ReactNode {
  const [done, setDone] = useState(false);

  const href = `${window.location.origin}/?join=${encodeURIComponent(shareToken)}`;

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(href);
      setDone(true);
      window.setTimeout(() => setDone(false), 2000);
    } catch {
      window.prompt("Copiază linkul:", href);
    }
  }, [href]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 0",
      }}
    >
      <button
        type="button"
        onClick={() => void onCopy()}
        style={{
          border: "1px solid #4c6fa5",
          background: "rgba(30, 58, 95, 0.5)",
          color: "#bfdbfe",
          borderRadius: 8,
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {done ? "Copiat!" : "Copiază link invitație"}
      </button>
      <span
        style={{
          fontSize: 11,
          color: "#8b9cb3",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 200,
        }}
        title={href}
      >
        {workspaceName}
      </span>
    </div>
  );
}
