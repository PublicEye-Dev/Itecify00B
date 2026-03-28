import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  aiSuggestionPayloadSchema,
  createAiSuggestionsResponseSchema,
  geminiSuggestionsEnvelopeSchema,
  type CreateAiSuggestionsBody,
  type CreateAiSuggestionsResponse,
} from "@itecify/shared/ai";
import { HttpError } from "../auth/errors.js";
import type { AiStructuredProvider } from "./ai.provider.js";
import { buildSystemInstruction, buildUserPrompt } from "./prompt.js";

function mapRow(row: {
  id: string;
  batchId: string;
  workspaceId: string;
  status: "VALIDATED" | "REJECTED_MALFORMED";
  filePath: string | null;
  operationType: "REPLACE" | "INSERT" | "DELETE" | null;
  targetRange: unknown;
  replacementText: string | null;
  explanation: string | null;
  confidence: number | null;
  parseError: string | null;
  createdAt: Date;
}): CreateAiSuggestionsResponse["validated"][number] {
  return {
    id: row.id,
    batchId: row.batchId,
    workspaceId: row.workspaceId,
    status: row.status,
    filePath: row.filePath,
    operationType: row.operationType,
    targetRange: row.targetRange as CreateAiSuggestionsResponse["validated"][number]["targetRange"],
    replacementText: row.replacementText,
    explanation: row.explanation,
    confidence: row.confidence,
    parseError: row.parseError,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function generateSuggestionsWithGemini(
  prisma: PrismaClient,
  deps: {
    gemini: AiStructuredProvider;
    workspaceId: string;
    body: CreateAiSuggestionsBody;
  },
): Promise<CreateAiSuggestionsResponse> {
  const batchId = randomUUID();
  const systemInstruction = buildSystemInstruction();
  const userPrompt = buildUserPrompt(deps.body);

  let rawText: string;
  try {
    rawText = await deps.gemini.generateStructuredJson({
      systemInstruction,
      userPrompt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new HttpError(502, `Gemini request failed: ${message}`);
  }

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(rawText) as unknown;
  } catch {
    await prisma.aiSuggestion.create({
      data: {
        batchId,
        workspaceId: deps.workspaceId,
        status: "REJECTED_MALFORMED",
        parseError: "Model output was not valid JSON.",
        rawCandidate: { rawTextPreview: rawText.slice(0, 16_000) },
      },
    });
    throw new HttpError(
      422,
      "Model returned non-JSON output; a malformed record was stored.",
    );
  }

  const envelope = geminiSuggestionsEnvelopeSchema.safeParse(parsedUnknown);
  if (!envelope.success) {
    await prisma.aiSuggestion.create({
      data: {
        batchId,
        workspaceId: deps.workspaceId,
        status: "REJECTED_MALFORMED",
        parseError: envelope.error.message,
        rawCandidate: parsedUnknown as object,
      },
    });
    throw new HttpError(
      422,
      "Model JSON failed envelope schema validation; a malformed record was stored.",
    );
  }

  const validated: CreateAiSuggestionsResponse["validated"] = [];
  const rejected: CreateAiSuggestionsResponse["rejected"] = [];

  for (const item of envelope.data.suggestions) {
    const one = aiSuggestionPayloadSchema.safeParse(item);
    if (!one.success) {
      await prisma.aiSuggestion.create({
        data: {
          batchId,
          workspaceId: deps.workspaceId,
          status: "REJECTED_MALFORMED",
          parseError: one.error.message,
          rawCandidate: item as object,
        },
      });
      rejected.push({
        parseError: one.error.message,
        rawCandidate: item,
      });
      continue;
    }

    const created = await prisma.aiSuggestion.create({
      data: {
        batchId,
        workspaceId: deps.workspaceId,
        status: "VALIDATED",
        filePath: one.data.filePath,
        operationType: one.data.operationType,
        targetRange: one.data.targetRange,
        replacementText: one.data.replacementText,
        explanation: one.data.explanation,
        confidence: one.data.confidence,
      },
    });
    validated.push(mapRow(created));
  }

  return createAiSuggestionsResponseSchema.parse({
    batchId,
    validated,
    rejected,
  });
}
