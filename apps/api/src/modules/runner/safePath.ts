import path from "node:path";

export function isSafeRelativeWorkspacePath(rel: string): boolean {
  if (!rel || rel.length > 4096) return false;
  if (rel.startsWith("/") || rel.includes("\0")) return false;
  const normalized = path.posix.normalize(rel.split("\\").join("/"));
  if (normalized.startsWith("..") || normalized.includes("/../") || normalized.includes("/..")) {
    return false;
  }
  return true;
}
