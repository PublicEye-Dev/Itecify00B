import { z } from "zod";

/** Interval compatibil Monaco IRange (1-based lines/columns). */
export const targetRangeSchema = z.object({
  startLineNumber: z.number().int().min(1),
  startColumn: z.number().int().min(1),
  endLineNumber: z.number().int().min(1),
  endColumn: z.number().int().min(1),
});

export type TargetRange = z.infer<typeof targetRangeSchema>;

export const suggestionOperationTypeSchema = z.enum(["REPLACE", "INSERT", "DELETE"]);

export type SuggestionOperationType = z.infer<typeof suggestionOperationTypeSchema>;

/**
 * O singură sugestie: obligatoriu pentru output valid.
 * AI nu scrie în buffer — clientul aplică după confirmare.
 */
export const aiSuggestionPayloadSchema = z.object({
  filePath: z.string().min(1).max(2048),
  operationType: suggestionOperationTypeSchema,
  targetRange: targetRangeSchema,
  replacementText: z.string(),
  explanation: z.string().min(1).max(16_000),
  confidence: z.number().min(0).max(1),
});

export type AiSuggestionPayload = z.infer<typeof aiSuggestionPayloadSchema>;

/** Răspuns envelope de la model (JSON). */
export const geminiSuggestionsEnvelopeSchema = z.object({
  suggestions: z.array(aiSuggestionPayloadSchema).max(50),
});

export type GeminiSuggestionsEnvelope = z.infer<typeof geminiSuggestionsEnvelopeSchema>;

/** Request API: generare sugestii. */
export const createAiSuggestionsBodySchema = z.object({
  instruction: z.string().min(1).max(16_000),
  contextFiles: z
    .array(
      z.object({
        path: z.string().min(1).max(2048),
        content: z.string().max(400_000),
      }),
    )
    .min(1)
    .max(32),
});

export type CreateAiSuggestionsBody = z.infer<typeof createAiSuggestionsBodySchema>;

export const aiSuggestionPersistedSchema = z.object({
  id: z.string(),
  batchId: z.string(),
  workspaceId: z.string(),
  status: z.enum(["VALIDATED", "REJECTED_MALFORMED"]),
  filePath: z.string().nullable(),
  operationType: suggestionOperationTypeSchema.nullable(),
  targetRange: targetRangeSchema.nullable(),
  replacementText: z.string().nullable(),
  explanation: z.string().nullable(),
  confidence: z.number().nullable(),
  parseError: z.string().nullable(),
  createdAt: z.string(),
});

export const createAiSuggestionsResponseSchema = z.object({
  batchId: z.string(),
  validated: z.array(aiSuggestionPersistedSchema),
  rejected: z.array(
    z.object({
      parseError: z.string(),
      rawCandidate: z.unknown().optional(),
    }),
  ),
});

export type CreateAiSuggestionsResponse = z.infer<typeof createAiSuggestionsResponseSchema>;
