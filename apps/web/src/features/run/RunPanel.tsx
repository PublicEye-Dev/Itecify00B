import type { ReactNode } from "react";
import type {
  RunJobPublicDto,
  RunLogEntryDto,
  RunStageStateDto,
  RunStageStatusDto,
  RunTemplateDto,
} from "@itecify/shared/runner";
import { InlineBanner } from "../../components/ui/inline-banner.js";
import type { RunStreamState } from "./useWorkspaceRun.js";

function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
  }
  return `${ms}ms`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function formatWhen(value: Date | null): string {
  if (!value) return "n/a";
  return value.toLocaleTimeString();
}

function describeStreamState(state: RunStreamState): string {
  switch (state) {
    case "connecting":
      return "connecting";
    case "live":
      return "live";
    case "reconnecting":
      return "reconnecting";
    case "closed":
      return "closed";
    default:
      return "idle";
  }
}

function toneForStage(status: RunStageStatusDto): {
  border: string;
  background: string;
  color: string;
} {
  switch (status) {
    case "in_progress":
      return {
        border: "#3b82f6",
        background: "rgba(59,130,246,0.16)",
        color: "#bfdbfe",
      };
    case "passed":
      return {
        border: "#16a34a",
        background: "rgba(22,163,74,0.14)",
        color: "#bbf7d0",
      };
    case "warning":
      return {
        border: "#d97706",
        background: "rgba(217,119,6,0.15)",
        color: "#fde68a",
      };
    case "blocked":
      return {
        border: "#dc2626",
        background: "rgba(220,38,38,0.18)",
        color: "#fecaca",
      };
    case "failed":
    case "timeout":
      return {
        border: "#ef4444",
        background: "rgba(239,68,68,0.16)",
        color: "#fecaca",
      };
    case "skipped":
      return {
        border: "#475569",
        background: "rgba(71,85,105,0.18)",
        color: "#cbd5e1",
      };
    default:
      return {
        border: "#334155",
        background: "rgba(15,23,42,0.55)",
        color: "#94a3b8",
      };
  }
}

function labelForStageStatus(status: RunStageStatusDto): string {
  switch (status) {
    case "in_progress":
      return "active";
    case "passed":
      return "passed";
    case "warning":
      return "warn";
    case "blocked":
      return "blocked";
    case "failed":
      return "failed";
    case "timeout":
      return "timeout";
    case "skipped":
      return "skipped";
    default:
      return "pending";
  }
}

function entryTone(stream: RunLogEntryDto["stream"]): string {
  switch (stream) {
    case "stdout":
      return "#d1fae5";
    case "stderr":
      return "#fecaca";
    case "system":
      return "#bfdbfe";
  }
}

function defaultStage(): RunStageStateDto {
  return { status: "pending", detail: null };
}

function buildTerminalStageState(
  job: RunJobPublicDto | null,
  kind: "completed" | "failed" | "blocked",
): RunStageStateDto {
  if (!job) {
    return defaultStage();
  }

  switch (kind) {
    case "completed":
      if (job.status === "SUCCEEDED") {
        return {
          status: "passed",
          detail: "Execution finished successfully.",
        };
      }
      if (job.status === "TIMEOUT") {
        return {
          status: "skipped",
          detail: "Execution timed out before a successful completion.",
        };
      }
      if (job.status === "BLOCKED") {
        return {
          status: "skipped",
          detail: "Execution was blocked before completion.",
        };
      }
      if (job.status === "FAILED" || job.status === "CANCELLED") {
        return {
          status: "skipped",
          detail: "Execution ended without completing successfully.",
        };
      }
      return {
        status: "skipped",
        detail: "Awaiting a successful terminal state.",
      };

    case "failed":
      if (job.status === "FAILED") {
        return {
          status: "failed",
          detail: job.errorMessage ?? "Execution failed.",
        };
      }
      if (job.status === "CANCELLED") {
        return {
          status: "failed",
          detail: job.errorMessage ?? "Execution was cancelled.",
        };
      }
      return {
        status: "skipped",
        detail: "Only active for non-timeout terminal failures.",
      };

    case "blocked":
      if (job.status === "BLOCKED") {
        return {
          status: "blocked",
          detail: job.errorMessage,
        };
      }
      return {
        status: "skipped",
        detail: "Only used when Semgrep blocks execution.",
      };
  }
}

function buildRunBanner(props: {
  job: RunJobPublicDto | null;
  error: string | null;
  isStarting: boolean;
  streamState: RunStreamState;
}): {
  tone: "info" | "success" | "warning" | "error";
  title: string;
  description: string;
} | null {
  if (props.error) {
    return {
      tone: "error",
      title: "Pipeline indisponibil",
      description: props.error,
    };
  }

  if (props.isStarting) {
    return {
      tone: "info",
      title: "Pregătim rularea",
      description:
        "Persist starea curentă a workspace-ului înainte de scan, build și execuție.",
    };
  }

  if (!props.job) {
    return {
      tone: "info",
      title: "Pipeline gata de pornire",
      description:
        "Lansează scanarea de securitate, build-ul și execuția sandbox dintr-un singur flux.",
    };
  }

  if (props.job.status === "BLOCKED") {
    return {
      tone: "warning",
      title: "Execuția a fost blocată",
      description:
        props.job.errorMessage ??
        props.job.scanReport?.summary ??
        "Semgrep a oprit rularea pe baza politicilor active.",
    };
  }

  if (props.job.status === "TIMEOUT") {
    return {
      tone: "warning",
      title: "Execuția a depășit timpul permis",
      description:
        props.job.errorMessage ??
        "Unul dintre pașii pipeline-ului a atins timeout-ul configurat.",
    };
  }

  if (props.job.status === "FAILED" || props.job.status === "CANCELLED") {
    return {
      tone: "error",
      title: "Pipeline-ul s-a oprit cu eroare",
      description:
        props.job.errorMessage ??
        "Verifică etapele și logurile pentru cauza exactă a opririi.",
    };
  }

  if (props.job.status === "SUCCEEDED") {
    return {
      tone: "success",
      title: "Pipeline finalizat cu succes",
      description:
        "Scanarea, build-ul și rularea s-au încheiat fără blocaje critice.",
    };
  }

  return {
    tone: props.streamState === "reconnecting" ? "warning" : "info",
    title:
      props.streamState === "reconnecting"
        ? "Fluxul live se reconectează"
        : "Pipeline activ",
    description:
      props.streamState === "reconnecting"
        ? "Logurile live revin imediat ce fluxul SSE se reconectează."
        : "Urmărește etapele de mai jos și logurile live din timpul rulării.",
  };
}

export function RunPanel(props: {
  job: RunJobPublicDto | null;
  liveLogs: RunLogEntryDto[];
  error: string | null;
  isStarting: boolean;
  canStart: boolean;
  streamState: RunStreamState;
  template: RunTemplateDto;
  onRun: () => Promise<void>;
}): ReactNode {
  const job = props.job;
  const stages = job?.stages ?? {
    scanning: defaultStage(),
    building: defaultStage(),
    running: defaultStage(),
  };
  const stageCards: Array<{ label: string; state: RunStageStateDto }> = [
    {
      label: "Scanning",
      state: stages.scanning,
    },
    {
      label: "Blocked",
      state: buildTerminalStageState(job, "blocked"),
    },
    {
      label: "Building",
      state: stages.building,
    },
    {
      label: "Running",
      state: stages.running,
    },
    {
      label: "Completed",
      state: buildTerminalStageState(job, "completed"),
    },
    {
      label: "Failed",
      state: buildTerminalStageState(job, "failed"),
    },
  ];

  const showPersistedLogs =
    props.liveLogs.length === 0 &&
    job != null &&
    (job.stdout.length > 0 || job.stderr.length > 0);
  const banner = buildRunBanner(props);

  return (
    <section
      style={{
        borderTop: "1px solid #273244",
        background:
          "linear-gradient(180deg, rgba(9,16,26,0.95) 0%, rgba(7,12,20,0.98) 100%)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflow: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              width: "fit-content",
              borderRadius: 999,
              border: "1px solid rgba(130, 160, 192, 0.18)",
              padding: "6px 10px",
              fontSize: 11,
              color: "#8fb7d0",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {props.template} sandbox
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#f8fafc" }}>
            Run Pipeline
          </div>
          <div
            style={{ fontSize: 12, color: "#94a3b8", letterSpacing: "0.05em" }}
          >
            Semgrep pre-run scan, build, execution, and live operator logs.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid #334155",
              background: "rgba(15,23,42,0.7)",
              color: "#cbd5e1",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Stream {describeStreamState(props.streamState)}
          </div>
          <button
            type="button"
            disabled={!props.canStart}
            onClick={() => {
              void props.onRun();
            }}
            style={{
              border: "1px solid #0284c7",
              background: props.canStart ? "#082f49" : "#102033",
              color: props.canStart ? "#dbeafe" : "#64748b",
              borderRadius: 10,
              padding: "10px 14px",
              cursor: props.canStart ? "pointer" : "not-allowed",
              fontWeight: 700,
            }}
          >
            {props.isStarting
              ? "Saving snapshot…"
              : props.canStart
                ? `Scan + Build + Run (${props.template})`
                : "Run in progress"}
          </button>
        </div>
      </div>

      {banner ? (
        <InlineBanner
          tone={banner.tone}
          title={banner.title}
          description={banner.description}
        />
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        {stageCards.map((item) => {
          const tone = toneForStage(item.state.status);
          return (
            <div
              key={item.label}
              style={{
                border: `1px solid ${tone.border}`,
                background: tone.background,
                borderRadius: 14,
                padding: 12,
                minHeight: 86,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}
                >
                  {item.label}
                </span>
                <span
                  style={{
                    color: tone.color,
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {labelForStageStatus(item.state.status)}
                </span>
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: tone.color,
                  lineHeight: 1.5,
                }}
              >
                {item.state.detail ?? "No stage data yet."}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <div
          style={{
            flex: "1 1 240px",
            border: "1px solid #233144",
            borderRadius: 14,
            padding: 14,
            background: "rgba(10,16,26,0.88)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "#94a3b8",
              textTransform: "uppercase",
            }}
          >
            Status
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 20,
              fontWeight: 700,
              color: "#f8fafc",
            }}
          >
            {job?.status ?? "IDLE"}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 13,
              color: "#cbd5e1",
              lineHeight: 1.5,
            }}
          >
            {props.error ?? job?.errorMessage ?? "No failure reason recorded."}
          </div>
          <div
            style={{
              marginTop: 12,
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
              fontSize: 12,
            }}
          >
            <span style={{ color: "#94a3b8" }}>
              Started {formatWhen(job?.startedAt ?? null)}
            </span>
            <span style={{ color: "#94a3b8" }}>
              Finished {formatWhen(job?.finishedAt ?? null)}
            </span>
            <span style={{ color: "#94a3b8" }}>
              Exit {job?.exitCode ?? "n/a"}
            </span>
          </div>
        </div>

        <div
          style={{
            flex: "1 1 260px",
            border: "1px solid #233144",
            borderRadius: 14,
            padding: 14,
            background: "rgba(10,16,26,0.88)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "#94a3b8",
              textTransform: "uppercase",
            }}
          >
            Limits
          </div>
          <div
            style={{
              marginTop: 10,
              display: "grid",
              gap: 6,
              fontSize: 13,
              color: "#dbeafe",
            }}
          >
            <div>
              Scan: {job?.policy.scan.cpus ?? "-"} CPU /{" "}
              {job?.policy.scan.memory ?? "-"} /{" "}
              {job ? formatDuration(job.policy.scan.timeoutMs) : "-"}
            </div>
            <div>
              Build: {job?.policy.build.cpus ?? "-"} CPU /{" "}
              {job?.policy.build.memory ?? "-"} /{" "}
              {job ? formatDuration(job.policy.build.timeoutMs) : "-"}
            </div>
            <div>
              Run: {job?.policy.run.cpus ?? "-"} CPU /{" "}
              {job?.policy.run.memory ?? "-"} /{" "}
              {job ? formatDuration(job.policy.run.timeoutMs) : "-"}
            </div>
            <div>
              Log guard: {job ? formatBytes(job.logStats.maxBytes) : "-"} max
            </div>
          </div>
          {job?.logStats.truncated ? (
            <div style={{ marginTop: 10, fontSize: 12, color: "#fca5a5" }}>
              Output capped at {formatBytes(job.logStats.maxBytes)}. Dropped{" "}
              {formatBytes(job.logStats.droppedBytes)}.
            </div>
          ) : (
            <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8" }}>
              Captured {job ? formatBytes(job.logStats.capturedBytes) : "0 B"}{" "}
              of live output.
            </div>
          )}
        </div>

        <div
          style={{
            flex: "1 1 300px",
            border: "1px solid #233144",
            borderRadius: 14,
            padding: 14,
            background: "rgba(10,16,26,0.88)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "#94a3b8",
              textTransform: "uppercase",
            }}
          >
            Scan Summary
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 18,
              fontWeight: 700,
              color: "#f8fafc",
            }}
          >
            {job?.scanReport?.outcome ?? "Not started"}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 13,
              color: "#cbd5e1",
              lineHeight: 1.5,
            }}
          >
            {job?.scanReport?.summary ??
              "No Semgrep report has been recorded for this run yet."}
          </div>
          {job?.scanReport ? (
            <div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                fontSize: 12,
              }}
            >
              <span style={{ color: "#fef08a" }}>
                Low {job.scanReport.counts.low}
              </span>
              <span style={{ color: "#fde68a" }}>
                Medium {job.scanReport.counts.medium}
              </span>
              <span style={{ color: "#fca5a5" }}>
                High {job.scanReport.counts.high}
              </span>
              <span style={{ color: "#f87171" }}>
                Critical {job.scanReport.counts.critical}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {job?.scanReport?.findings.length ? (
        <div
          style={{
            border: "1px solid #233144",
            borderRadius: 14,
            background: "rgba(10,16,26,0.88)",
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "#94a3b8",
              textTransform: "uppercase",
            }}
          >
            Findings
          </div>
          <div
            style={{
              marginTop: 10,
              display: "grid",
              gap: 8,
              maxHeight: 180,
              overflow: "auto",
            }}
          >
            {job.scanReport.findings.map((finding) => (
              <div
                key={`${finding.ruleId}:${finding.path}:${finding.startLine}:${finding.startCol}`}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: 10,
                  borderRadius: 10,
                  background: "rgba(15,23,42,0.65)",
                }}
              >
                <span
                  style={{
                    minWidth: 72,
                    textAlign: "center",
                    borderRadius: 999,
                    padding: "4px 8px",
                    fontSize: 11,
                    fontWeight: 700,
                    background:
                      finding.severity === "LOW"
                        ? "rgba(37,99,235,0.2)"
                        : finding.severity === "MEDIUM"
                          ? "rgba(217,119,6,0.2)"
                          : "rgba(220,38,38,0.2)",
                    color:
                      finding.severity === "LOW"
                        ? "#bfdbfe"
                        : finding.severity === "MEDIUM"
                          ? "#fde68a"
                          : "#fecaca",
                  }}
                >
                  {finding.severity}
                </span>
                <div style={{ display: "grid", gap: 4 }}>
                  <div
                    style={{ fontSize: 13, color: "#f8fafc", fontWeight: 600 }}
                  >
                    {finding.message}
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    {finding.path}:{finding.startLine}:{finding.startCol} ·{" "}
                    {finding.ruleId}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div
        style={{
          border: "1px solid #233144",
          borderRadius: 14,
          background: "rgba(4,8,15,0.96)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            borderBottom: "1px solid #1f2937",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                color: "#94a3b8",
                textTransform: "uppercase",
              }}
            >
              Live Logs
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
              System entries show stage transitions; stdout and stderr stream in
              real time.
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            {props.liveLogs.length} buffered entries
          </div>
        </div>

        {props.liveLogs.length > 0 ? (
          <div style={{ maxHeight: 260, overflow: "auto", padding: 14 }}>
            {props.liveLogs.map((entry) => (
              <div
                key={`${entry.sequence}:${entry.createdAt}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "84px 64px minmax(0, 1fr)",
                  gap: 10,
                  padding: "4px 0",
                  fontFamily: '"Cascadia Code", "Fira Code", monospace',
                  fontSize: 12,
                  lineHeight: 1.55,
                  color: entryTone(entry.stream),
                }}
              >
                <span style={{ color: "#64748b" }}>
                  {new Date(entry.createdAt).toLocaleTimeString()}
                </span>
                <span style={{ color: "#94a3b8", textTransform: "uppercase" }}>
                  {entry.stream}
                </span>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    color: entryTone(entry.stream),
                    fontFamily: "inherit",
                  }}
                >
                  {entry.chunk}
                </pre>
              </div>
            ))}
          </div>
        ) : showPersistedLogs ? (
          <div style={{ display: "grid", gap: 12, padding: 14 }}>
            {job.stdout ? (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    color: "#86efac",
                  }}
                >
                  stdout
                </div>
                <pre
                  style={{
                    margin: "8px 0 0",
                    color: "#d1fae5",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: '"Cascadia Code", "Fira Code", monospace',
                    fontSize: 12,
                  }}
                >
                  {job.stdout}
                </pre>
              </div>
            ) : null}
            {job.stderr ? (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    color: "#fca5a5",
                  }}
                >
                  stderr / system
                </div>
                <pre
                  style={{
                    margin: "8px 0 0",
                    color: "#fecaca",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: '"Cascadia Code", "Fira Code", monospace',
                    fontSize: 12,
                  }}
                >
                  {job.stderr}
                </pre>
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ padding: 18, fontSize: 13, color: "#64748b" }}>
            No live logs yet. Start a run to stream scan, build, and runtime
            output here.
          </div>
        )}
      </div>
    </section>
  );
}
