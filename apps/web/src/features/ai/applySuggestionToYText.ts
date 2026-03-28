import * as Y from "yjs";
import type { Text as YText } from "yjs";
import type { SuggestionOperationType, TargetRange } from "@itecify/shared/ai";
import { targetRangeToOffsets } from "@itecify/shared/ai";

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
  const { start, end } = targetRangeToOffsets(fullText, range);
  const len = end - start;

  ydoc.transact(() => {
    if (operationType === "DELETE") {
      if (len > 0) ytext.delete(start, len);
      return;
    }
    if (operationType === "INSERT") {
      ytext.insert(start, replacementText);
      return;
    }
    if (len > 0) ytext.delete(start, len);
    ytext.insert(start, replacementText);
  });
}
