import type { CreateAiSuggestionsBody } from "@itecify/shared/ai";

function formatFileForPrompt(content: string): string {
  const lines = content.split(/\r\n|\r|\n/);
  const width = String(lines.length).length;

  return lines
    .map((line, index) => `${String(index + 1).padStart(width, "0")} | ${line}`)
    .join("\n");
}

/**
 * Separat de apelul HTTP și de parsare — ușor de testat și de schimbat modelul.
 */
export function buildSystemInstruction(): string {
  return [
    "You are a senior software assistant for a collaborative code editor.",
    "You MUST NOT assume edits are applied automatically.",
    'Return ONLY structured JSON matching the schema: an object with key "suggestions" (array).',
    "Each suggestion must identify: filePath, operationType (REPLACE|INSERT|DELETE),",
    "targetRange (Monaco-style 1-based line/column: startLineNumber, startColumn, endLineNumber, endColumn),",
    "replacementText (full text to insert or replace; empty string allowed for pure delete if operationType is DELETE),",
    "explanation (short, for the developer), confidence between 0 and 1.",
    "Suggestions must be actionable and scoped; prefer small, safe edits.",
    "Always choose the SMALLEST possible targetRange that captures the change.",
    "Do not include unchanged surrounding code in targetRange or replacementText.",
    "For REPLACE, replacementText must contain only the new text for the selected range, not the whole function or file.",
    "For INSERT, targetRange must be zero-width.",
    "For DELETE, replacementText must be an empty string.",
    "Context files are shown with line-number prefixes like '001 | code'. Use those line numbers for Monaco startLineNumber/endLineNumber.",
    "Columns must be counted on the original code after the '|' prefix, starting at 1.",
  ].join("\n");
}

export function buildUserPrompt(body: CreateAiSuggestionsBody): string {
  const parts: string[] = [
    "User instruction:",
    body.instruction.trim(),
    "",
    "Context files (read-only; do not modify buffer directly — output suggestions only):",
  ];

  for (const f of body.contextFiles) {
    parts.push(`--- File: ${f.path} ---`);
    parts.push(formatFileForPrompt(f.content));
    parts.push("");
  }

  return parts.join("\n");
}
