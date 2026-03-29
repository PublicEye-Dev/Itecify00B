import {
  extractTextInRange,
  resolveSuggestionPatchInText,
} from "@itecify/shared/ai";
import type { SuggestionOperationType, TargetRange } from "@itecify/shared/ai";

/** Conflict dacă textul curent din interval nu mai coincide cu snapshot-ul de la generare. */
export function hasSuggestionConflict(
  fileText: string,
  operationType: SuggestionOperationType,
  range: TargetRange,
  replacementText: string,
  sourceSpanText: string | null,
): boolean {
  if (sourceSpanText == null) return false;
  const resolvedPatch = resolveSuggestionPatchInText(
    fileText,
    operationType,
    range,
    replacementText,
    sourceSpanText,
  );
  if (
    resolvedPatch.wasClamped ||
    resolvedPatch.validationError != null ||
    resolvedPatch.isNoop
  ) {
    return true;
  }
  const current = extractTextInRange(fileText, resolvedPatch.range);
  return current !== resolvedPatch.sourceText;
}
