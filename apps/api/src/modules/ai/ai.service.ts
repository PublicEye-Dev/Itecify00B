import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  aiSuggestionPayloadSchema,
  createAiSuggestionsResponseSchema,
  geminiSuggestionsEnvelopeSchema,
  resolveSuggestionPatchInText,
  type CreateAiSuggestionsBody,
  type CreateAiSuggestionsResponse,
} from "@itecify/shared/ai";
import { HttpError } from "../auth/errors.js";
import type { AiStructuredProvider } from "./ai.provider.js";
import { toAiSuggestionDto } from "./aiSuggestion.mapper.js";
import { buildSystemInstruction, buildUserPrompt } from "./prompt.js";

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
    if (message.startsWith("GEMINI_QUOTA:")) {
      throw new HttpError(429, message.replace(/^GEMINI_QUOTA:\s*/, ""));
    }
    const short = message.length > 900 ? `${message.slice(0, 900)}…` : message;
    throw new HttpError(502, `Gemini request failed: ${short}`);
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

    const ctx = deps.body.contextFiles.find(
      (f) => f.path === one.data.filePath,
    );
    if (ctx == null) {
      const parseError =
        "Suggestion filePath must match one of the provided context files.";
      await prisma.aiSuggestion.create({
        data: {
          batchId,
          workspaceId: deps.workspaceId,
          status: "REJECTED_MALFORMED",
          parseError,
          rawCandidate: item as object,
        },
      });
      rejected.push({
        parseError,
        rawCandidate: item,
      });
      continue;
    }

    const resolvedPatch = resolveSuggestionPatchInText(
      ctx.content,
      one.data.operationType,
      one.data.targetRange,
      one.data.replacementText,
    );

    if (resolvedPatch.wasClamped) {
      const parseError =
        "Suggestion targetRange does not fit the provided file content.";
      await prisma.aiSuggestion.create({
        data: {
          batchId,
          workspaceId: deps.workspaceId,
          status: "REJECTED_MALFORMED",
          parseError,
          rawCandidate: item as object,
        },
      });
      rejected.push({
        parseError,
        rawCandidate: item,
      });
      continue;
    }

    if (resolvedPatch.validationError) {
      await prisma.aiSuggestion.create({
        data: {
          batchId,
          workspaceId: deps.workspaceId,
          status: "REJECTED_MALFORMED",
          parseError: resolvedPatch.validationError,
          rawCandidate: item as object,
        },
      });
      rejected.push({
        parseError: resolvedPatch.validationError,
        rawCandidate: item,
      });
      continue;
    }

    if (resolvedPatch.isNoop) {
      const parseError = "Suggestion does not change the file content.";
      await prisma.aiSuggestion.create({
        data: {
          batchId,
          workspaceId: deps.workspaceId,
          status: "REJECTED_MALFORMED",
          parseError,
          rawCandidate: item as object,
        },
      });
      rejected.push({
        parseError,
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
        operationType: resolvedPatch.operationType,
        targetRange: resolvedPatch.range,
        replacementText: resolvedPatch.replacementText,
        sourceSpanText: resolvedPatch.sourceText,
        explanation: one.data.explanation,
        confidence: one.data.confidence,
      },
    });
    validated.push(toAiSuggestionDto(created));
  }

  return createAiSuggestionsResponseSchema.parse({
    batchId,
    validated,
    rejected,
  });
}
