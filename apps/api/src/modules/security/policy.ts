import {
  runPolicySchema,
  type RunFindingSeverityDto,
  type RunPhaseLimitsDto,
  type RunPolicyDto,
  type RunTemplateDto,
} from "@itecify/shared/runner";

const SEVERITY_ORDER: RunFindingSeverityDto[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

const TEMPLATE_DEFAULTS: Record<
  RunTemplateDto,
  { build: RunPhaseLimitsDto; run: RunPhaseLimitsDto }
> = {
  javascript: {
    build: { cpus: "0.50", memory: "128m", timeoutMs: 4000 },
    run: { cpus: "0.75", memory: "256m", timeoutMs: 10000 },
  },
  python: {
    build: { cpus: "0.50", memory: "128m", timeoutMs: 4000 },
    run: { cpus: "0.75", memory: "256m", timeoutMs: 12000 },
  },
  java: {
    build: { cpus: "1.50", memory: "768m", timeoutMs: 45000 },
    run: { cpus: "1.00", memory: "512m", timeoutMs: 15000 },
  },
  c: {
    build: { cpus: "1.00", memory: "384m", timeoutMs: 30000 },
    run: { cpus: "0.75", memory: "256m", timeoutMs: 10000 },
  },
};

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.round(value);
}

function readSeverityEnv(
  name: string,
  fallback: RunFindingSeverityDto,
): RunFindingSeverityDto {
  const raw = process.env[name]?.trim().toUpperCase();
  if (!raw) return fallback;
  return SEVERITY_ORDER.includes(raw as RunFindingSeverityDto)
    ? (raw as RunFindingSeverityDto)
    : fallback;
}

function resolvePhaseLimits(
  envPrefix: string,
  defaults: RunPhaseLimitsDto,
): RunPhaseLimitsDto {
  return runPolicySchema.shape.scan.parse({
    cpus:
      process.env[`${envPrefix}_CPUS`] ??
      process.env.RUNNER_DOCKER_CPUS ??
      defaults.cpus,
    memory:
      process.env[`${envPrefix}_MEMORY`] ??
      process.env.RUNNER_DOCKER_MEMORY ??
      defaults.memory,
    timeoutMs: readPositiveIntEnv(
      `${envPrefix}_TIMEOUT_MS`,
      defaults.timeoutMs,
    ),
  });
}

export function isSeverityAtLeast(
  severity: RunFindingSeverityDto,
  threshold: RunFindingSeverityDto,
): boolean {
  return SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(threshold);
}

export function resolveRunPolicy(template: RunTemplateDto): RunPolicyDto {
  const defaults = TEMPLATE_DEFAULTS[template];

  return runPolicySchema.parse({
    maxLogBytes: readPositiveIntEnv("RUNNER_MAX_LOG_BYTES", 128 * 1024),
    blockOnSeverity: readSeverityEnv("RUNNER_SCAN_BLOCK_SEVERITY", "HIGH"),
    scan: resolvePhaseLimits("RUNNER_SCAN", {
      cpus: "1.00",
      memory: "512m",
      timeoutMs: 15000,
    }),
    build: resolvePhaseLimits("RUNNER_BUILD", defaults.build),
    run: resolvePhaseLimits("RUNNER_RUN", defaults.run),
  });
}
