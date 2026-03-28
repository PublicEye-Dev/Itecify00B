import type { PrismaClient } from "@prisma/client";
import {
  listAiSuggestionsResponseSchema,
  patchAiSuggestionResponseSchema,
} from "@itecify/shared/ai";
import { HttpError } from "../auth/errors.js";
import { getWorkspaceForUser } from "../workspaces/workspace.service.js";
import { toAiSuggestionDto } from "./aiSuggestion.mapper.js";

export async function listAiSuggestionsForWorkspace(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  pendingOnly: boolean,
) {
  await getWorkspaceForUser(prisma, userId, workspaceId);

  const rows = await prisma.aiSuggestion.findMany({
    where: {
      workspaceId,
      ...(pendingOnly ? { status: "VALIDATED" } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return listAiSuggestionsResponseSchema.parse({
    suggestions: rows.map(toAiSuggestionDto),
  });
}

export async function patchAiSuggestionStatus(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  suggestionId: string,
  action: "accept" | "reject",
) {
  await getWorkspaceForUser(prisma, userId, workspaceId);

  const row = await prisma.aiSuggestion.findFirst({
    where: { id: suggestionId, workspaceId },
  });

  if (!row) {
    throw new HttpError(404, "Sugestie inexistentă.");
  }

  if (row.status !== "VALIDATED") {
    throw new HttpError(
      409,
      "Sugestia nu mai poate fi modificată (nu este în așteptare).",
    );
  }

  const nextStatus = action === "accept" ? "ACCEPTED" : "USER_REJECTED";

  const updated = await prisma.aiSuggestion.update({
    where: { id: suggestionId },
    data: { status: nextStatus },
  });

  return patchAiSuggestionResponseSchema.parse({
    suggestion: toAiSuggestionDto(updated),
  });
}
