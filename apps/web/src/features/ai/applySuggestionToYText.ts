import * as Y from "yjs";
import type { Text as YText } from "yjs";
import type { SuggestionOperationType, TargetRange } from "@itecify/shared/ai";
import { resolveSuggestionPatchInText } from "@itecify/shared/ai";

/**
 * Aplică o singură sugestie într-o tranzacție Yjs (un singur undo step colaborativ).
 */
export function applySuggestionToYText(
  ydoc: Y.Doc,
  ytext: YText,
  operationType: SuggestionOperationType,
  range: TargetRange,
  replacementText: string,
): void {
  const fullText = ytext.toString();
  const resolvedPatch = resolveSuggestionPatchInText(
    fullText,
    operationType,
    range,
    replacementText,
  );
  if (resolvedPatch.wasClamped) {
    throw new Error(
      "Sugestia AI nu se mai potrivește cu versiunea curentă a fișierului. Generează din nou sau revizuiește conflictul.",
    );
  }

  if (resolvedPatch.validationError) {
    throw new Error(resolvedPatch.validationError);
  }

  if (resolvedPatch.isNoop) {
    throw new Error(
      "Sugestia AI nu schimbă conținutul fișierului și nu poate fi aplicată.",
    );
  }

  const { start, end } = resolvedPatch;
  const len = end - start;

  ydoc.transact(() => {
    if (resolvedPatch.operationType === "DELETE") {
      if (len > 0) ytext.delete(start, len);
      return;
    }
    if (resolvedPatch.operationType === "INSERT") {
      ytext.insert(start, resolvedPatch.replacementText);
      return;
    }
    if (len > 0) ytext.delete(start, len);
    ytext.insert(start, resolvedPatch.replacementText);
  });
}
