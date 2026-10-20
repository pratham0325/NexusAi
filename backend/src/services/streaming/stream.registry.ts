/**
 * Stream registry — tracks active generations so the SSE endpoint can
 * subscribe with replay of already-buffered deltas, and so clients can stop.
 */
import { randomUUID } from "node:crypto";
import type { StreamEvent } from "../../types/index.js";

interface ActiveStream {
  id: string;
  userId: string;
  events: StreamEvent[];
  subscribers: Set<(ev: StreamEvent) => void>;
  abort: AbortController | null;
  startedAt: number;
  finished: boolean;
}

const TTL_MS = 5 * 60 * 1000;
const streams = new Map<string, ActiveStream>();

export function createStream(userId: string): ActiveStream {
  // Opportunistic cleanup of stale finished streams.
  for (const [id, s] of streams) {
    if (s.finished && Date.now() - s.startedAt > TTL_MS) streams.delete(id);
  }
  const id = randomUUID();
  const s: ActiveStream = {
    id,
    userId,
    events: [],
    subscribers: new Set(),
    abort: new AbortController(),
    startedAt: Date.now(),
    finished: false,
  };
  streams.set(id, s);
  return s;
}

/** Generations still running for a user (for the concurrency cap). */
export function activeStreamCount(userId: string): number {
  let count = 0;
  for (const s of streams.values()) {
    if (s.userId === userId && !s.finished) count++;
  }
  return count;
}

export function getStream(id: string): ActiveStream | undefined {
  const s = streams.get(id);
  if (s && Date.now() - s.startedAt > TTL_MS + 60_000) {
    streams.delete(id);
    return undefined;
  }
  return s;
}

export function pushEvent(stream: ActiveStream, ev: StreamEvent): void {
  stream.events.push(ev);
  for (const sub of stream.subscribers) sub(ev);
}

export function subscribe(
  stream: ActiveStream,
  fn: (ev: StreamEvent) => void,
): () => void {
  stream.subscribers.add(fn);
  return () => stream.subscribers.delete(fn);
}

export function finishStream(stream: ActiveStream): void {
  stream.finished = true;
  stream.abort = null;
  for (const sub of stream.subscribers) {
    stream.subscribers.delete(sub);
  }
}

export function stopStream(id: string, userId: string): boolean {
  const s = streams.get(id);
  if (!s || s.userId !== userId || s.finished) return false;
  pushEvent(s, { type: "error", message: "Generation stopped" });
  s.abort?.abort();
  finishStream(s);
  return true;
}
