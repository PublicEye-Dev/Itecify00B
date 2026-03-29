import type { CSSProperties, ReactNode } from "react";

export function InlineBanner({
  tone,
  title,
  description,
  action,
  compact = false,
}: {
  tone: "info" | "success" | "warning" | "error";
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}): ReactNode {
  return (
    <div
      className={`itecify-inline-banner itecify-inline-banner--${tone}`}
      style={compact ? compactStyle : undefined}
    >
      <div className="itecify-inline-banner-copy">
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      {action ? (
        <div className="itecify-inline-banner-action">{action}</div>
      ) : null}
    </div>
  );
}

const compactStyle: CSSProperties = {
  padding: "10px 12px",
  minHeight: "unset",
};
