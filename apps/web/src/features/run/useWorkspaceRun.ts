import { startTransition, useEffect, useRef, useState } from "react";
import type {
  RunJobPublicDto,
  RunJobStatusDto,
  RunLogEntryDto,
  RunTemplateDto,
} from "@itecify/shared/runner";
import { createRunJob, subscribeRunJob } from "../../lib/api/jobApi.js";

const TERMINAL_STATUSES = new Set<RunJobStatusDto>([
  "SUCCEEDED",
  "FAILED",
  "TIMEOUT",
  "CANCELLED",
  "BLOCKED",
]);

const MAX_LIVE_LOGS = 500;

export type RunStreamState =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting"
  | "closed";

export function useWorkspaceRun(opts: {
  workspaceId: string;
  template: RunTemplateDto;
  persistSnapshot: () => Promise<void>;
  /** Apelat după persistSnapshot reușit, înainte de createRunJob (ex. refresh istoric). */
  onAfterSnapshotPersist?: () => void;
}) {
  const [job, setJob] = useState<RunJobPublicDto | null>(null);
  const [liveLogs, setLiveLogs] = useState<RunLogEntryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [streamState, setStreamState] = useState<RunStreamState>("idle");
  const closeStreamRef = useRef<(() => void) | null>(null);
  const lastSequenceRef = useRef(0);

  const isActive = job != null && !TERMINAL_STATUSES.has(job.status);

  useEffect(() => {
    return () => {
      closeStreamRef.current?.();
      closeStreamRef.current = null;
    };
  }, []);

  function attachStream(jobId: string): void {
    closeStreamRef.current?.();
    lastSequenceRef.current = 0;
    setStreamState("connecting");

    let isDisposed = false;
    let dispose: () => void = () => undefined;

    dispose = subscribeRunJob(jobId, {
      onOpen: () => {
        if (!isDisposed) {
          setStreamState("live");
        }
      },
      onSnapshot: (nextJob) => {
        if (isDisposed) return;
        setJob(nextJob);
        if (TERMINAL_STATUSES.has(nextJob.status)) {
          setStreamState("closed");
        }
      },
      onLog: (entry) => {
        if (isDisposed || entry.sequence <= lastSequenceRef.current) return;
        lastSequenceRef.current = entry.sequence;
        setStreamState("live");
        startTransition(() => {
          setLiveLogs((current) => {
            if (current.length >= MAX_LIVE_LOGS) {
              return [...current.slice(-(MAX_LIVE_LOGS - 1)), entry];
            }
            return [...current, entry];
          });
        });
      },
      onDone: (nextJob) => {
        if (isDisposed) return;
        setJob(nextJob);
        setStreamState("closed");
        isDisposed = true;
        dispose();
        closeStreamRef.current = null;
      },
      onError: () => {
        if (!isDisposed) {
          setStreamState("reconnecting");
        }
      },
    });

    closeStreamRef.current = () => {
      if (isDisposed) return;
      isDisposed = true;
      dispose();
      closeStreamRef.current = null;
    };
  }

  async function startRun(): Promise<
    { ok: true } | { ok: false; message: string }
  > {
    if (isStarting || isActive) {
      return {
        ok: false,
        message:
          "O rulare este deja activă sau pipeline-ul se pornește. Așteaptă finalizarea sau tab-ul Run.",
      };
    }

    setIsStarting(true);
    setError(null);
    setLiveLogs([]);
    lastSequenceRef.current = 0;
    closeStreamRef.current?.();
    closeStreamRef.current = null;

    try {
      await opts.persistSnapshot();
      opts.onAfterSnapshotPersist?.();
      const { job: created } = await createRunJob({
        workspaceId: opts.workspaceId,
        template: opts.template,
      });
      setJob(created);
      attachStream(created.id);
      return { ok: true };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setStreamState("idle");
      setError(message);
      return { ok: false, message };
    } finally {
      setIsStarting(false);
    }
  }

  return {
    job,
    liveLogs,
    error,
    isActive,
    isStarting,
    streamState,
    canStart: !isStarting && !isActive,
    startRun,
  };
}
