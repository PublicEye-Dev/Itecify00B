import { Awareness } from "y-protocols/awareness";

export type PresenceKind = "human" | "ai";

export type AwarenessUserInfo = {
  name: string;
  color: string;
};

export type CollabAwarenessState = {
  user?: AwarenessUserInfo;
  activeFile?: string | null;
  /** Cursor/selection — setat de y-monaco `MonacoBinding` */
  selection?: unknown;
  presenceKind?: PresenceKind;
};

export type CollabPeerView = {
  clientId: number;
  name: string;
  color: string;
  activeFile: string | null;
  isSelf: boolean;
  kind: PresenceKind;
};

export function parseAwarenessState(raw: unknown): CollabAwarenessState {
  if (raw == null || typeof raw !== "object") return {};
  return raw as CollabAwarenessState;
}

export type AwarenessInstance = InstanceType<typeof Awareness>;
