import { EventEmitter } from "node:events";
import type { RunJobPublicDto } from "@itecify/shared/runner";

export type JobLogEvent = {
  sequence: number;
  stream: "stdout" | "stderr" | "system";
  chunk: string;
  createdAt: string;
};

export type JobStreamEvent =
  | {
      type: "log";
      sequence: number;
      entry: JobLogEvent;
    }
  | {
      type: "snapshot";
      sequence: number;
      job: RunJobPublicDto;
    };

const recent = new Map<string, JobLogEvent[]>();
const sequences = new Map<string, number>();
const MAX_RECENT = 200;

const bus = new EventEmitter();
bus.setMaxListeners(200);

function nextSequence(jobId: string): number {
  const next = (sequences.get(jobId) ?? 0) + 1;
  sequences.set(jobId, next);
  return next;
}

export function emitJobLog(
  jobId: string,
  ev: Omit<JobLogEvent, "sequence" | "createdAt">,
): JobLogEvent {
  const entry: JobLogEvent = {
    ...ev,
    sequence: nextSequence(jobId),
    createdAt: new Date().toISOString(),
  };

  const arr = recent.get(jobId) ?? [];
  arr.push(entry);
  while (arr.length > MAX_RECENT) arr.shift();
  recent.set(jobId, arr);
  bus.emit(jobId, {
    type: "log",
    sequence: entry.sequence,
    entry,
  } satisfies JobStreamEvent);
  return entry;
}

export function emitJobSnapshot(jobId: string, job: RunJobPublicDto): number {
  const sequence = nextSequence(jobId);
  bus.emit(jobId, { type: "snapshot", sequence, job } satisfies JobStreamEvent);
  return sequence;
}

export function subscribeJobLogs(
  jobId: string,
  fn: (ev: JobStreamEvent) => void,
): () => void {
  bus.on(jobId, fn);
  return () => {
    bus.off(jobId, fn);
  };
}

export function getRecentJobLogs(
  jobId: string,
  afterSequence = 0,
): JobLogEvent[] {
  return [...(recent.get(jobId) ?? [])].filter(
    (entry) => entry.sequence > afterSequence,
  );
}

export function clearJobLogBuffer(jobId: string): void {
  recent.delete(jobId);
  sequences.delete(jobId);
}
