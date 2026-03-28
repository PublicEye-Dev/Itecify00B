import { EventEmitter } from "node:events";

export type JobLogEvent = {
  stream: "stdout" | "stderr";
  chunk: string;
};

const recent = new Map<string, JobLogEvent[]>();
const MAX_RECENT = 200;

const bus = new EventEmitter();
bus.setMaxListeners(200);

export function emitJobLog(jobId: string, ev: JobLogEvent): void {
  const arr = recent.get(jobId) ?? [];
  arr.push(ev);
  while (arr.length > MAX_RECENT) arr.shift();
  recent.set(jobId, arr);
  bus.emit(jobId, ev);
}

export function subscribeJobLogs(jobId: string, fn: (ev: JobLogEvent) => void): () => void {
  bus.on(jobId, fn);
  return () => {
    bus.off(jobId, fn);
  };
}

export function getRecentJobLogs(jobId: string): JobLogEvent[] {
  return [...(recent.get(jobId) ?? [])];
}

export function clearJobLogBuffer(jobId: string): void {
  recent.delete(jobId);
}
