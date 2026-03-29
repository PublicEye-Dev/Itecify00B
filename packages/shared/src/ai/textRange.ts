import type {
  SuggestionOperationType,
  TargetRange,
} from "./suggestion.schema.js";

type TextLineInfo = {
  start: number;
  text: string;
};

export type ResolvedTargetRange = {
  start: number;
  end: number;
  wasClamped: boolean;
  isReversed: boolean;
};

export type SuggestionTextDelta = {
  operationType: SuggestionOperationType;
  sourceText: string;
  replacementText: string;
  trimmedPrefixLength: number;
  trimmedSuffixLength: number;
  isNoop: boolean;
  validationError: string | null;
};

export type ResolvedSuggestionPatch = ResolvedTargetRange & {
  operationType: SuggestionOperationType;
  range: TargetRange;
  sourceText: string;
  replacementText: string;
  trimmedPrefixLength: number;
  trimmedSuffixLength: number;
  isNoop: boolean;
  validationError: string | null;
};

function buildTextLines(fullText: string): TextLineInfo[] {
  const lines: TextLineInfo[] = [];
  let lineStart = 0;
  const lineBreakPattern = /\r\n|\r|\n/g;

  for (const match of fullText.matchAll(lineBreakPattern)) {
    const matchIndex = match.index ?? 0;
    lines.push({
      start: lineStart,
      text: fullText.slice(lineStart, matchIndex),
    });
    lineStart = matchIndex + match[0].length;
  }

  lines.push({
    start: lineStart,
    text: fullText.slice(lineStart),
  });

  return lines;
}

function positionAtOffset(
  lines: TextLineInfo[],
  fullText: string,
  offset: number,
): { lineNumber: number; column: number } {
  const safeOffset = Math.max(0, Math.min(offset, fullText.length));

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const nextLineStart = lines[index + 1]?.start ?? fullText.length;
    const lineEnd = line.start + line.text.length;

    if (safeOffset <= lineEnd) {
      return {
        lineNumber: index + 1,
        column: safeOffset - line.start + 1,
      };
    }

    if (safeOffset < nextLineStart) {
      return {
        lineNumber: index + 1,
        column: line.text.length + 1,
      };
    }
  }

  const lastLine = lines[lines.length - 1] ?? { start: 0, text: "" };
  return {
    lineNumber: Math.max(1, lines.length),
    column: safeOffset - lastLine.start + 1,
  };
}

function sharedPrefixLength(left: string, right: string): number {
  const maxLength = Math.min(left.length, right.length);
  let index = 0;

  while (index < maxLength && left[index] === right[index]) {
    index += 1;
  }

  return index;
}

function sharedSuffixLength(
  left: string,
  right: string,
  prefixLength: number,
): number {
  const maxLength = Math.min(
    left.length - prefixLength,
    right.length - prefixLength,
  );
  let index = 0;

  while (
    index < maxLength &&
    left[left.length - 1 - index] === right[right.length - 1 - index]
  ) {
    index += 1;
  }

  return index;
}

export function resolveTargetRangeInText(
  fullText: string,
  range: TargetRange,
): ResolvedTargetRange {
  const lines = buildTextLines(fullText);
  const lineCount = lines.length;

  function offsetAt(
    lineNumber: number,
    column: number,
  ): { offset: number; wasClamped: boolean } {
    let wasClamped = false;
    let safeLineNumber = lineNumber;

    if (safeLineNumber < 1) {
      safeLineNumber = 1;
      wasClamped = true;
    } else if (safeLineNumber > lineCount) {
      safeLineNumber = lineCount;
      wasClamped = true;
    }

    const line = lines[safeLineNumber - 1] ?? {
      start: fullText.length,
      text: "",
    };
    const maxColumn = line.text.length + 1;
    let safeColumn = column;

    if (safeColumn < 1) {
      safeColumn = 1;
      wasClamped = true;
    } else if (safeColumn > maxColumn) {
      safeColumn = maxColumn;
      wasClamped = true;
    }

    return {
      offset: line.start + (safeColumn - 1),
      wasClamped,
    };
  }

  const startPosition = offsetAt(range.startLineNumber, range.startColumn);
  const endPosition = offsetAt(range.endLineNumber, range.endColumn);
  const isReversed = startPosition.offset > endPosition.offset;

  return {
    start: startPosition.offset,
    end: isReversed ? startPosition.offset : endPosition.offset,
    wasClamped:
      startPosition.wasClamped || endPosition.wasClamped || isReversed,
    isReversed,
  };
}

/**
 * Convertește interval Monaco (1-based lines/columns) în offset-uri în string UTF-16
 * (aliniat cu `monaco.ITextModel.getOffsetAt`). Sfârșitul intervalului e exclusiv: slice(start, end).
 */
export function targetRangeToOffsets(
  fullText: string,
  range: TargetRange,
): { start: number; end: number } {
  const { start, end } = resolveTargetRangeInText(fullText, range);
  return { start, end };
}

export function targetRangeFromOffsets(
  fullText: string,
  start: number,
  end: number,
): TargetRange {
  const lines = buildTextLines(fullText);
  const startPosition = positionAtOffset(lines, fullText, start);
  const endPosition = positionAtOffset(lines, fullText, end);

  return {
    startLineNumber: startPosition.lineNumber,
    startColumn: startPosition.column,
    endLineNumber: endPosition.lineNumber,
    endColumn: endPosition.column,
  };
}

export function extractTextInRange(
  fullText: string,
  range: TargetRange,
): string {
  const { start, end } = targetRangeToOffsets(fullText, range);
  return fullText.slice(start, end);
}

export function computeSuggestionTextDelta(
  operationType: SuggestionOperationType,
  sourceText: string,
  replacementText: string,
): SuggestionTextDelta {
  if (operationType === "INSERT") {
    return {
      operationType,
      sourceText: "",
      replacementText,
      trimmedPrefixLength: 0,
      trimmedSuffixLength: 0,
      isNoop: replacementText.length === 0,
      validationError:
        sourceText.length > 0
          ? "INSERT suggestions must target a zero-width range."
          : null,
    };
  }

  if (operationType === "DELETE") {
    return {
      operationType,
      sourceText,
      replacementText: "",
      trimmedPrefixLength: 0,
      trimmedSuffixLength: 0,
      isNoop: sourceText.length === 0,
      validationError: null,
    };
  }

  const trimmedPrefixLength = sharedPrefixLength(sourceText, replacementText);
  const trimmedSuffixLength = sharedSuffixLength(
    sourceText,
    replacementText,
    trimmedPrefixLength,
  );
  const nextSourceText = sourceText.slice(
    trimmedPrefixLength,
    sourceText.length - trimmedSuffixLength,
  );
  const nextReplacementText = replacementText.slice(
    trimmedPrefixLength,
    replacementText.length - trimmedSuffixLength,
  );

  let nextOperationType: SuggestionOperationType = "REPLACE";
  if (nextSourceText.length === 0 && nextReplacementText.length > 0) {
    nextOperationType = "INSERT";
  } else if (nextSourceText.length > 0 && nextReplacementText.length === 0) {
    nextOperationType = "DELETE";
  }

  return {
    operationType: nextOperationType,
    sourceText: nextOperationType === "INSERT" ? "" : nextSourceText,
    replacementText: nextOperationType === "DELETE" ? "" : nextReplacementText,
    trimmedPrefixLength,
    trimmedSuffixLength,
    isNoop: nextSourceText.length === 0 && nextReplacementText.length === 0,
    validationError: null,
  };
}

export function detectPreferredLineEnding(fullText: string): "\r\n" | "\n" {
  const firstBreak = fullText.match(/\r\n|\r|\n/);
  if (firstBreak?.[0] === "\r\n") {
    return "\r\n";
  }
  return "\n";
}

export function normalizeLineEndings(
  text: string,
  preferredLineEnding: "\r\n" | "\n",
): string {
  if (preferredLineEnding === "\r\n") {
    return text.replace(/\r?\n/g, "\r\n");
  }
  return text.replace(/\r\n/g, "\n");
}

export function resolveSuggestionPatchInText(
  fullText: string,
  operationType: SuggestionOperationType,
  range: TargetRange,
  replacementText: string,
  sourceTextOverride?: string,
): ResolvedSuggestionPatch {
  const resolvedRange = resolveTargetRangeInText(fullText, range);
  const preferredLineEnding = detectPreferredLineEnding(fullText);
  const normalizedReplacementText =
    operationType === "DELETE"
      ? ""
      : normalizeLineEndings(replacementText, preferredLineEnding);
  const rawSourceText =
    sourceTextOverride ??
    fullText.slice(resolvedRange.start, resolvedRange.end);
  const delta = computeSuggestionTextDelta(
    operationType,
    rawSourceText,
    normalizedReplacementText,
  );
  const start = resolvedRange.start + delta.trimmedPrefixLength;
  const end = resolvedRange.end - delta.trimmedSuffixLength;

  return {
    ...resolvedRange,
    operationType: delta.operationType,
    range: targetRangeFromOffsets(fullText, start, end),
    sourceText: delta.sourceText,
    replacementText: delta.replacementText,
    trimmedPrefixLength: delta.trimmedPrefixLength,
    trimmedSuffixLength: delta.trimmedSuffixLength,
    isNoop: delta.isNoop,
    validationError: delta.validationError,
    start,
    end,
  };
}
