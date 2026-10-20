/** SSE streaming client for AI generation. */
import { tokenStore } from "@/api/client";

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onDone: () => void;
  onError?: (message: string) => void;
}

/**
 * Connects to GET /api/stream/:streamId and forwards token deltas. Uses
 * fetch + ReadableStream for full control and clean aborts.
 */
export async function streamGeneration(
  streamId: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const base = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
  const url = `${base}/stream/${encodeURIComponent(streamId)}`;
  let buffer = "";
  let flushTimer: number | null = null;
  let pending = "";

  const flush = () => {
    if (!pending) return;
    handlers.onDelta(pending);
    pending = "";
  };
  const schedule = () => {
    if (flushTimer !== null) return;
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      flush();
    }, 60);
  };

  try {
    const headers: Record<string, string> = {};
    const access = tokenStore.access;
    if (access) headers.Authorization = `Bearer ${access}`;
    const res = await fetch(url, { signal, credentials: "include", headers });
    if (!res.ok || !res.body) {
      throw new Error(`Stream failed (${res.status})`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let sse = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      sse += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = sse.indexOf("\n\n")) !== -1) {
        const frame = sse.slice(0, idx);
        sse = sse.slice(idx + 2);
        const dataLine = frame
          .split("\n")
          .find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        try {
          const event = JSON.parse(dataLine.slice(5).trim()) as {
            type: string;
            text?: string;
            message?: string;
          };
          if (event.type === "delta" && event.text) {
            buffer += event.text;
            pending = buffer;
            schedule();
          } else if (event.type === "done") {
            flush();
            handlers.onDone();
            return;
          } else if (event.type === "timeout") {
            flush();
            handlers.onError?.("Stream timed out");
            return;
          } else if (event.type === "error") {
            flush();
            handlers.onError?.(event.message ?? "Stream error");
            return;
          }
        } catch {
          // ignore malformed frames
        }
      }
    }
    flush();
    handlers.onDone();
  } catch (err) {
    if (signal?.aborted) {
      flush();
      handlers.onDone();
      return;
    }
    flush();
    handlers.onError?.(err instanceof Error ? err.message : String(err));
  } finally {
    if (flushTimer !== null) window.clearTimeout(flushTimer);
  }
}
