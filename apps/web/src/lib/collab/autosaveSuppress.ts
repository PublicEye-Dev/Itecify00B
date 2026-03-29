/**
 * Evită PUT-uri de snapshot care ar suprascrie un restore sau starea în curs de reload.
 * Folosește sessionStorage ca să supraviețuiască până la navigare.
 */
const SUPPRESS_UNTIL_KEY = "itecify-suppress-autosave-until";

export function suppressAutosavePersistForMs(ms: number): void {
  try {
    sessionStorage.setItem(SUPPRESS_UNTIL_KEY, String(Date.now() + ms));
  } catch {
    /* ignore */
  }
}

export function isAutosavePersistSuppressed(): boolean {
  try {
    const raw = sessionStorage.getItem(SUPPRESS_UNTIL_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until) || Date.now() >= until) {
      sessionStorage.removeItem(SUPPRESS_UNTIL_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearExpiredAutosaveSuppress(): void {
  try {
    const raw = sessionStorage.getItem(SUPPRESS_UNTIL_KEY);
    if (!raw) return;
    const until = Number(raw);
    if (!Number.isFinite(until) || Date.now() >= until) {
      sessionStorage.removeItem(SUPPRESS_UNTIL_KEY);
    }
  } catch {
    /* ignore */
  }
}
