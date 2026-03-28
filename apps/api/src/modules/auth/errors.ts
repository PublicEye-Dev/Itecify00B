import type { ZodError } from "zod";
import { apiErrorSchema, type ApiErrorDto } from "@itecify/shared/auth";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export function toFieldErrors(
  error: ZodError,
): Record<string, string[]> | undefined {
  const fieldErrors = Object.entries(error.flatten().fieldErrors).reduce<
    Record<string, string[]>
  >((accumulator, [field, issues]) => {
    if (issues && issues.length > 0) {
      accumulator[field] = issues;
    }
    return accumulator;
  }, {});

  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined;
}

export function toErrorDto(
  message: string,
  fieldErrors?: Record<string, string[]>,
): ApiErrorDto {
  return apiErrorSchema.parse({
    message,
    ...(fieldErrors ? { fieldErrors } : {}),
  });
}
