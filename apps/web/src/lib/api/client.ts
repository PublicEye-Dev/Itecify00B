import { apiErrorSchema, type ApiErrorDto } from "@itecify/shared/auth";

type Parser<T> = {
  parse(value: unknown): T;
};

function joinUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export class ApiClientError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly fieldErrors?: ApiErrorDto["fieldErrors"],
  ) {
    super(message);
  }
}

export function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL;
  if (typeof configured === "string" && configured.length > 0) {
    return configured.replace(/\/$/, "");
  }

  return `${window.location.protocol}//${window.location.hostname}:3001`;
}

export async function fetchApi<T>(
  path: string,
  init: RequestInit,
  parser: Parser<T>,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(joinUrl(resolveApiBaseUrl(), path), {
    ...init,
    credentials: "include",
    headers,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    const parsed = payload ? apiErrorSchema.safeParse(payload) : null;
    throw new ApiClientError(
      response.status,
      parsed?.success ? parsed.data.message : "Request failed.",
      parsed?.success ? parsed.data.fieldErrors : undefined,
    );
  }

  return parser.parse(payload);
}
