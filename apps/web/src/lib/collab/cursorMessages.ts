export type CursorMoveMessage = {
  type: "CURSOR_MOVE";
  workspaceId: string;
  userId: string;
  displayName: string;
  color: string;
  filePath: string;
  cursor: { index: number; line: number; column: number };
  selection: { start: number; end: number };
  timestamp: number;
};

export type CursorLeaveMessage = {
  type: "CURSOR_LEAVE";
  workspaceId: string;
  userId: string;
  timestamp: number;
};

export function isCursorMoveMessage(v: unknown): v is CursorMoveMessage {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.type !== "CURSOR_MOVE") return false;
  if (typeof o.userId !== "string" || !o.userId) return false;
  if (typeof o.workspaceId !== "string" || !o.workspaceId) return false;
  if (typeof o.filePath !== "string") return false;
  if (typeof o.displayName !== "string") return false;
  if (typeof o.color !== "string" || o.color.length < 4) return false;
  const c = o.cursor;
  if (!c || typeof c !== "object") return false;
  const cr = c as Record<string, unknown>;
  if (typeof cr.index !== "number") return false;
  const s = o.selection;
  if (!s || typeof s !== "object") return false;
  const se = s as Record<string, unknown>;
  return typeof se.start === "number" && typeof se.end === "number";
}

export function isCursorLeaveMessage(v: unknown): v is CursorLeaveMessage {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.type === "CURSOR_LEAVE" &&
    typeof o.userId === "string" &&
    o.userId.length > 0 &&
    typeof o.workspaceId === "string" &&
    o.workspaceId.length > 0
  );
}
