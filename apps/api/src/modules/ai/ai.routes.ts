import { randomUUID } from "node:crypto";
import {
  createAiSuggestionsBodySchema,
  createAiSuggestionsResponseSchema,
  patchAiSuggestionBodySchema,
} from "@itecify/shared/ai";
import type { FastifyInstance } from "fastify";
import { HttpError } from "../auth/errors.js";
import { getWorkspaceForUser } from "../workspaces/workspace.service.js";
import { generateSuggestionsWithGemini } from "./ai.service.js";
import {
  listAiSuggestionsForWorkspace,
  patchAiSuggestionStatus,
} from "./aiSuggestionReview.service.js";
import { GeminiAdapter, resolveGeminiApiKey } from "./gemini.adapter.js";

function parsePendingOnlyFlag(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  const s = String(raw).toLowerCase();
  if (s === "false" || s === "0") return false;
  return true;
}

/** O singură generare activă per (user, workspace) — blochează cursă cross-tab / dublu POST. */
const aiSuggestionInflight = new Set<string>();

function aiSuggestionLockKey(userId: string, workspaceId: string): string {
  return `${userId}\u001f${workspaceId}`;
}

const isAiDevLog =
  process.env.NODE_ENV !== "production" && process.env.AI_DEBUG_LOG !== "0";

export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: { workspaceId: string };
    Querystring: { pendingOnly?: string };
  }>(
    "/workspaces/:workspaceId/ai/suggestions",
    { preHandler: [app.authenticate] },
    async (request) => {
      const pendingOnly = parsePendingOnlyFlag(request.query.pendingOnly);
      return listAiSuggestionsForWorkspace(
        app.prisma,
        request.auth!.user.id,
        request.params.workspaceId,
        pendingOnly,
      );
    },
  );

  app.patch<{
    Params: { workspaceId: string; suggestionId: string };
    Body: unknown;
  }>(
    "/workspaces/:workspaceId/ai/suggestions/:suggestionId",
    { preHandler: [app.authenticate] },
    async (request) => {
      const body = patchAiSuggestionBodySchema.parse(request.body);
      return patchAiSuggestionStatus(
        app.prisma,
        request.auth!.user.id,
        request.params.workspaceId,
        request.params.suggestionId,
        body.action === "accept" ? "accept" : "reject",
      );
    },
  );

  app.post<{
    Params: { workspaceId: string };
    Body: unknown;
  }>(
    "/workspaces/:workspaceId/ai/suggestions",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = createAiSuggestionsBodySchema.parse(request.body);

      await getWorkspaceForUser(
        app.prisma,
        request.auth!.user.id,
        request.params.workspaceId,
      );

      const apiKey = resolveGeminiApiKey();
      if (!apiKey) {
        throw new HttpError(
          503,
          "AI provider is not configured. Set GEMINI_API_KEY or GOOGLE_GEN_AI_API_KEY in the server environment.",
        );
      }

      const userId = request.auth!.user.id;
      const workspaceId = request.params.workspaceId;
      const lockKey = aiSuggestionLockKey(userId, workspaceId);
      if (aiSuggestionInflight.has(lockKey)) {
        throw new HttpError(
          409,
          "O generare de sugestii AI rulează deja pentru acest workspace. Așteaptă finalizarea sau anulează din alt tab.",
        );
      }
      aiSuggestionInflight.add(lockKey);

      const clientRidRaw = request.headers["x-ai-request-id"];
      const clientRid =
        typeof clientRidRaw === "string" && clientRidRaw.length > 0
          ? clientRidRaw
          : undefined;
      const serverRid = randomUUID();
      if (isAiDevLog) {
        console.debug("[itecify][ai/suggestions] handler", {
          serverRequestId: serverRid,
          clientRequestId: clientRid,
          workspaceId,
          userId,
        });
      }

      try {
        const gemini = new GeminiAdapter(apiKey);
        const result = await generateSuggestionsWithGemini(app.prisma, {
          gemini,
          workspaceId,
          body,
        });

        if (isAiDevLog) {
          console.debug("[itecify][ai/suggestions] ok", {
            serverRequestId: serverRid,
            workspaceId,
            batchId: result.batchId,
          });
        }

        return reply
          .code(201)
          .send(createAiSuggestionsResponseSchema.parse(result));
      } finally {
        aiSuggestionInflight.delete(lockKey);
      }
    },
  );
}
