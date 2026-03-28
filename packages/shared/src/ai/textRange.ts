import type { TargetRange } from "./suggestion.schema.js";

/**
 * Convertește interval Monaco (1-based lines/columns) în offset-uri în string UTF-16
 * (aliniat cu `monaco.ITextModel.getOffsetAt`). Sfârșitul intervalului e exclusiv: slice(start, end).
 */
export function targetRangeToOffsets(
  fullText: string,
  range: TargetRange,
): { start: number; end: number } {
  const lines = fullText.split(/\r?\n/);
  const lineCount = lines.length;

  function offsetAt(lineNumber: number, column: number): number {
    if (lineNumber < 1) return 0;
    if (lineNumber > lineCount) {
      return fullText.length;
    }
    let offset = 0;
    for (let i = 0; i < lineNumber - 1; i++) {
      offset += lines[i]!.length + 1;
    }
    const line = lines[lineNumber - 1] ?? "";
    const col = Math.max(0, Math.min(column - 1, line.length));
    return offset + col;
  }

  const start = offsetAt(range.startLineNumber, range.startColumn);
  const end = offsetAt(range.endLineNumber, range.endColumn);
  return { start, end: Math.max(start, end) };
}

export function extractTextInRange(fullText: string, range: TargetRange): string {
  const { start, end } = targetRangeToOffsets(fullText, range);
  return fullText.slice(start, end);
}
