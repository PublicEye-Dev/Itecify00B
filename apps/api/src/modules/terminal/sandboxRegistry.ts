/** Registru în memorie: containerul sandbox pentru terminal per workspace. */

const sandboxes = new Map<string, { containerName: string }>();

export function registerSandbox(
  workspaceId: string,
  containerName: string,
): void {
  sandboxes.set(workspaceId, { containerName });
}

export function getRegisteredSandbox(
  workspaceId: string,
): { containerName: string } | undefined {
  return sandboxes.get(workspaceId);
}

export function clearSandbox(workspaceId: string): void {
  sandboxes.delete(workspaceId);
}
