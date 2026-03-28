import type { CreateAiSuggestionsBody } from "@itecify/shared/ai";

/**
 * Separat de apelul HTTP și de parsare — ușor de testat și de schimbat modelul.
 */
export function buildSystemInstruction(): string {
  return [
    "You are a senior software assistant for a collaborative code editor.",
    "You MUST NOT assume edits are applied automatically.",
    "Return ONLY structured JSON matching the schema: an object with key \"suggestions\" (array).",
    "Each suggestion must identify: filePath, operationType (REPLACE|INSERT|DELETE),",
    "targetRange (Monaco-style 1-based line/column: startLineNumber, startColumn, endLineNumber, endColumn),",
    "replacementText (full text to insert or replace; empty string allowed for pure delete if operationType is DELETE),",
    "explanation (short, for the developer), confidence between 0 and 1.",
    "Suggestions must be actionable and scoped; prefer small, safe edits.",
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
    parts.push(f.content);
    parts.push("");
  }

  return parts.join("\n");
}
