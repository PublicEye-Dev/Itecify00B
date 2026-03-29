export type HealthResponse = {
  status: "ok";
  service: "api" | "collab";
  timestamp: string;
};

export function createHealthPayload(
  service: HealthResponse["service"],
): HealthResponse {
  return {
    status: "ok",
    service,
    timestamp: new Date().toISOString(),
  };
}

export * from "./auth/index.js";
export * from "./collab/index.js";
export * from "./runner/index.js";
export * from "./workspaces/index.js";
export * from "./replay/index.js";
