/**
 * Stocare în memorie pentru „ultimul snapshot” al unui workspace.
 * În producție se înlocuiește cu Postgres / S3 etc.; aici e suficient pentru
 * a demonstra seed la deschidere și persistare între restarturi ale API-ului
 * (doar cât procesul trăiește).
 */
const store = new Map<string, Uint8Array>();

export function getSnapshot(workspaceId: string): Uint8Array | undefined {
  return store.get(workspaceId);
}

export function setSnapshot(workspaceId: string, update: Uint8Array): void {
  store.set(workspaceId, update);
}
