import {
  createAiSuggestionsBodySchema,
  createAiSuggestionsResponseSchema,
} from "@itecify/shared/ai";
import type { FastifyInstance } from "fastify";
import { HttpError } from "../auth/errors.js";
import { getWorkspaceForUser } from "../workspaces/workspace.service.js";
import { generateSuggestionsWithGemini } from "./ai.service.js";
import { GeminiAdapter } from "./gemini.adapter.js";

export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
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

      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey) {
        throw new HttpError(
          503,
          "AI provider is not configured. Set GEMINI_API_KEY in the server environment.",
        );
      }

      const gemini = new GeminiAdapter(apiKey);
      const result = await generateSuggestionsWithGemini(app.prisma, {
        gemini,
        workspaceId: request.params.workspaceId,
        body,
      });

      return reply
        .code(201)
        .send(createAiSuggestionsResponseSchema.parse(result));
    },
  );
}
