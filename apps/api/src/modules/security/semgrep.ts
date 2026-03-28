import * as fs from "node:fs/promises";
import path from "node:path";
import {
  runScanReportSchema,
  type RunFindingSeverityDto,
  type RunPolicyDto,
  type RunScanCountsDto,
  type RunScanFindingDto,
  type RunScanReportDto,
  type RunTemplateDto,
} from "@itecify/shared/runner";
import { runInDocker } from "../runner/dockerRunner.js";
import { isSeverityAtLeast } from "./policy.js";

const SEMGREP_RULESET = `rules:
  - id: itecify.javascript.eval
    languages: [javascript, typescript]
    severity: ERROR
    message: Avoid eval in code submitted for execution.
    metadata:
      severity: HIGH
      category: code-execution
    pattern: eval(...)

  - id: itecify.javascript.function-constructor
    languages: [javascript, typescript]
    severity: ERROR
    message: Avoid the Function constructor in the sandbox runner.
    metadata:
      severity: HIGH
      category: code-execution
    pattern: new Function(...)

  - id: itecify.python.eval
    languages: [python]
    severity: ERROR
    message: Avoid eval in Python submissions.
    metadata:
      severity: HIGH
      category: code-execution
    pattern: eval(...)

  - id: itecify.python.exec
    languages: [python]
    severity: ERROR
    message: Avoid exec in Python submissions.
    metadata:
      severity: HIGH
      category: code-execution
    pattern: exec(...)

  - id: itecify.python.os-system
    languages: [python]
    severity: ERROR
    message: Avoid os.system in Python submissions.
    metadata:
      severity: HIGH
      category: command-execution
    pattern: os.system(...)

  - id: itecify.python.subprocess-shell
    languages: [python]
    severity: ERROR
    message: Avoid subprocess shell=True in Python submissions.
    metadata:
      severity: HIGH
      category: command-execution
    pattern-either:
      - pattern: subprocess.run(..., shell=True, ...)
      - pattern: subprocess.Popen(..., shell=True, ...)

  - id: itecify.java.runtime-exec
    languages: [java]
    severity: ERROR
    message: Avoid Runtime.exec in Java submissions.
    metadata:
      severity: HIGH
      category: command-execution
    pattern: Runtime.getRuntime().exec(...)

  - id: itecify.java.process-builder
    languages: [java]
    severity: WARNING
    message: Review ProcessBuilder usage before execution.
    metadata:
      severity: MEDIUM
      category: command-execution
    pattern: new ProcessBuilder(...)

  - id: itecify.c.system
    languages: [c]
    severity: ERROR
    message: Avoid system() in C submissions.
    metadata:
      severity: HIGH
      category: command-execution
    pattern: system(...)

  - id: itecify.c.popen
    languages: [c]
    severity: ERROR
    message: Avoid popen() in C submissions.
    metadata:
      severity: HIGH
      category: command-execution
    pattern: popen(...)
`;

type SemgrepResult = {
  check_id?: unknown;
  path?: unknown;
  start?: { line?: unknown; col?: unknown };
  end?: { line?: unknown; col?: unknown };
  extra?: {
    message?: unknown;
    severity?: unknown;
    metadata?: {
      severity?: unknown;
      category?: unknown;
    };
  };
};

function normalizeSeverity(raw: unknown): RunFindingSeverityDto {
  const normalized = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  switch (normalized) {
    case "LOW":
    case "INFO":
      return "LOW";
    case "MEDIUM":
    case "WARNING":
      return "MEDIUM";
    case "HIGH":
    case "ERROR":
      return "HIGH";
    case "CRITICAL":
      return "CRITICAL";
    default:
      return "MEDIUM";
  }
}

function normalizePath(value: unknown): string {
  const raw = typeof value === "string" ? value : "unknown";
  return raw.replace(/^\/workspace\/?/, "").replace(/\\/g, "/");
}

function normalizePos(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 1;
  return Math.round(num);
}

function buildCounts(findings: RunScanFindingDto[]): RunScanCountsDto {
  return findings.reduce<RunScanCountsDto>(
    (counts, finding) => {
      switch (finding.severity) {
        case "LOW":
          counts.low += 1;
          break;
        case "MEDIUM":
          counts.medium += 1;
          break;
        case "HIGH":
          counts.high += 1;
          break;
        case "CRITICAL":
          counts.critical += 1;
          break;
      }
      return counts;
    },
    { low: 0, medium: 0, high: 0, critical: 0 },
  );
}

function summarizeReport(report: RunScanReportDto): string {
  if (report.findingCount === 0) {
    return "Semgrep scan passed with no findings.";
  }
  if (report.outcome === "BLOCKED") {
    return `Semgrep found ${report.findingCount} findings; ${report.blockingFindingCount} meet the blocking threshold (${report.blockOnSeverity}+).`;
  }
  return `Semgrep found ${report.findingCount} finding(s); review before execution.`;
}

function parseSemgrepJson(
  raw: string,
  blockOnSeverity: RunFindingSeverityDto,
): RunScanReportDto {
  const parsed = JSON.parse(raw) as { results?: SemgrepResult[] };
  const findings = (parsed.results ?? []).map((result) => {
    const severity = normalizeSeverity(
      result.extra?.metadata?.severity ?? result.extra?.severity,
    );

    return {
      ruleId:
        typeof result.check_id === "string" ? result.check_id : "unknown-rule",
      severity,
      message:
        typeof result.extra?.message === "string"
          ? result.extra.message
          : "Semgrep reported a policy match.",
      path: normalizePath(result.path),
      startLine: normalizePos(result.start?.line),
      startCol: normalizePos(result.start?.col),
      endLine: normalizePos(result.end?.line ?? result.start?.line),
      endCol: normalizePos(result.end?.col ?? result.start?.col),
      category:
        typeof result.extra?.metadata?.category === "string"
          ? result.extra.metadata.category
          : null,
    } satisfies RunScanFindingDto;
  });

  const counts = buildCounts(findings);
  const blockingFindingCount = findings.filter((finding) =>
    isSeverityAtLeast(finding.severity, blockOnSeverity),
  ).length;

  const outcome =
    findings.length === 0
      ? "CLEAN"
      : blockingFindingCount > 0
        ? "BLOCKED"
        : "WARN";

  const report = runScanReportSchema.parse({
    scanner: "semgrep-ce",
    scannedAt: new Date().toISOString(),
    outcome,
    blockOnSeverity,
    findingCount: findings.length,
    blockingFindingCount,
    counts,
    findings,
    summary: "",
  });

  return {
    ...report,
    summary: summarizeReport(report),
  };
}

export async function runSemgrepScan(opts: {
  jobId: string;
  label: string;
  template: RunTemplateDto;
  workDir: string;
  policy: RunPolicyDto;
  onSystemLog: (chunk: string) => void;
}): Promise<RunScanReportDto> {
  const rulesFile = path.join(opts.workDir, ".itecify.semgrep.yml");
  await fs.writeFile(rulesFile, SEMGREP_RULESET, "utf8");

  let stdout = "";
  let stderr = "";

  try {
    opts.onSystemLog("[scan] Running Semgrep CE pre-run scan.\n");

    const result = await runInDocker({
      workDirHost: opts.workDir,
      image: process.env.RUNNER_IMAGE_SEMGREP ?? "semgrep/semgrep:latest",
      command: [
        "semgrep",
        "--config",
        "/workspace/.itecify.semgrep.yml",
        "--json",
        "--disable-version-check",
        "--metrics=off",
        "--quiet",
        "--no-git-ignore",
        "--exclude",
        ".itecify.semgrep.yml",
        "--exclude",
        ".itecify-build",
        "/workspace",
      ],
      label: `${opts.label}.scan`,
      containerName: `itecify-scan-${opts.jobId}`,
      timeoutMs: opts.policy.scan.timeoutMs,
      limits: opts.policy.scan,
      mountMode: "rw",
      onStdout: (chunk) => {
        stdout += chunk;
      },
      onStderr: (chunk) => {
        stderr += chunk;
        if (chunk.trim()) {
          opts.onSystemLog(`[scan] ${chunk}`);
        }
      },
    });

    if ((result.exitCode ?? 1) !== 0) {
      throw new Error(
        stderr.trim() || `Semgrep exited with code ${result.exitCode ?? 1}.`,
      );
    }

    const report = parseSemgrepJson(stdout, opts.policy.blockOnSeverity);
    opts.onSystemLog(`[scan] ${report.summary}\n`);
    for (const finding of report.findings.slice(0, 10)) {
      opts.onSystemLog(
        `[scan] ${finding.severity} ${finding.path}:${finding.startLine} ${finding.message}\n`,
      );
    }
    if (report.findings.length > 10) {
      opts.onSystemLog(
        `[scan] ${report.findings.length - 10} more finding(s) omitted from live log view.\n`,
      );
    }

    return report;
  } catch (error) {
    if (error instanceof Error && error.message === "TIMEOUT") {
      throw new Error("SECURITY_SCAN_TIMEOUT");
    }
    if (error instanceof SyntaxError) {
      throw new Error("SECURITY_SCAN_PARSE_FAILED");
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`SECURITY_SCAN_FAILED:${message}`);
  } finally {
    await fs.rm(rulesFile, { force: true }).catch(() => undefined);
  }
}
