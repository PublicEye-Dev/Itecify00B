export type HealthResponse = {
  status: "ok";
  service: "api" | "collab";
  timestamp: string;
};

export function createHealthPayload(service: HealthResponse["service"]): HealthResponse {
  return {
    status: "ok",
    service,
    timestamp: new Date().toISOString(),
  };
}

export * from "./collab/index.js";
