import { extractTextInRange } from "@itecify/shared/ai";
import type { TargetRange } from "@itecify/shared/ai";

/** Conflict dacă textul curent din interval nu mai coincide cu snapshot-ul de la generare. */
export function hasSuggestionConflict(
  fileText: string,
  range: TargetRange,
  sourceSpanText: string | null,
): boolean {
  if (sourceSpanText == null) return false;
  const current = extractTextInRange(fileText, range);
  return current !== sourceSpanText;
}
