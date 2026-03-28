import type { AiSuggestion } from "@prisma/client";
import { aiSuggestionPersistedSchema } from "@itecify/shared/ai";
import type { z } from "zod";

type Persisted = z.infer<typeof aiSuggestionPersistedSchema>;

export function toAiSuggestionDto(row: AiSuggestion): Persisted {
  return {
    id: row.id,
    batchId: row.batchId,
    workspaceId: row.workspaceId,
    status: row.status,
    filePath: row.filePath,
    operationType: row.operationType,
    targetRange: row.targetRange as Persisted["targetRange"],
    replacementText: row.replacementText,
    sourceSpanText: row.sourceSpanText,
    explanation: row.explanation,
    confidence: row.confidence,
    parseError: row.parseError,
    createdAt: row.createdAt.toISOString(),
  };
}
