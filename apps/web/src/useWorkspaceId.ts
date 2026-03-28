import { useMemo } from "react";

/** `?workspace=demo` în URL; implicit `default`. */
export function useWorkspaceId(): string {
  return useMemo(
    () => new URLSearchParams(window.location.search).get("workspace") ?? "default",
    [],
  );
}
