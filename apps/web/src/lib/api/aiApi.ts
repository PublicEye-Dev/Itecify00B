import {
  createAiSuggestionsBodySchema,
  createAiSuggestionsResponseSchema,
  listAiSuggestionsResponseSchema,
  patchAiSuggestionResponseSchema,
  type CreateAiSuggestionsBody,
  type CreateAiSuggestionsResponse,
} from "@itecify/shared/ai";
import { fetchApi } from "./client.js";

export async function createAiSuggestions(
  workspaceId: string,
  body: CreateAiSuggestionsBody,
): Promise<CreateAiSuggestionsResponse> {
  const parsedBody = createAiSuggestionsBodySchema.parse(body);
  const requestId = crypto.randomUUID();
  if (import.meta.env.DEV) {
    console.debug("[itecify][ai/suggestions] fetch POST", { requestId, workspaceId });
  }
  return fetchApi(
    `/workspaces/${encodeURIComponent(workspaceId)}/ai/suggestions`,
    {
      method: "POST",
      body: JSON.stringify(parsedBody),
      headers: {
        "X-Ai-Request-Id": requestId,
      },
    },
    { parse: (payload: unknown) => createAiSuggestionsResponseSchema.parse(payload) },
  );
}

export async function listAiSuggestions(
  workspaceId: string,
  pendingOnly = true,
): Promise<ReturnType<typeof listAiSuggestionsResponseSchema.parse>> {
  const q = pendingOnly ? "?pendingOnly=true" : "?pendingOnly=false";
  return fetchApi(
    `/workspaces/${encodeURIComponent(workspaceId)}/ai/suggestions${q}`,
    { method: "GET" },
    { parse: (payload: unknown) => listAiSuggestionsResponseSchema.parse(payload) },
  );
}

export async function patchAiSuggestion(
  workspaceId: string,
  suggestionId: string,
  action: "accept" | "reject",
): Promise<ReturnType<typeof patchAiSuggestionResponseSchema.parse>> {
  return fetchApi(
    `/workspaces/${encodeURIComponent(workspaceId)}/ai/suggestions/${encodeURIComponent(suggestionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ action }),
    },
    { parse: (payload: unknown) => patchAiSuggestionResponseSchema.parse(payload) },
  );
}
