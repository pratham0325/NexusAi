/** Chat controller — starts/stops AI generations over the stream registry. */
import type { Request, Response, NextFunction } from "express";
import { Message } from "../models/Message.js";
import { UsageEvent } from "../models/UsageEvent.js";
import { env } from "../config/env.js";
import {
  complete,
  ProviderHttpError,
  stream,
} from "../services/ai/provider.js";
import { buildPromptContext } from "../services/chat/chat.service.js";
import { logger } from "../utils/logger.js";
import {
  activeStreamCount,
  createStream,
  finishStream,
  getStream,
  pushEvent,
  stopStream,
  subscribe,
} from "../services/streaming/stream.registry.js";
import { HttpError } from "../utils/http-error.js";
import { chatGenerateSchema, chatStopSchema } from "../validators/index.js";

const GENERATION_TIMEOUT_MS = 120_000;

export async function postGenerate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED", "Not signed in");
    const parsed = chatGenerateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION", "Invalid conversation ID");
    }

    // Validates ownership and assembles the prompt before streaming starts.
    const ctx = await buildPromptContext(
      parsed.data.conversationId,
      req.user.id,
      env.DEFAULT_AI_MODEL,
    );

    if (activeStreamCount(req.user.id) >= env.MAX_CONCURRENT_GENERATIONS) {
      throw new HttpError(
        429,
        "TOO_MANY_GENERATIONS",
        "Another reply is still being generated — wait for it to finish",
      );
    }

    const streamRec = createStream(req.user.id);

    // The last user message is already in ctx.messages; generate the reply.
    void runGeneration(ctx, streamRec).catch(() => undefined);

    res.json({ success: true, data: { streamId: streamRec.id } });
  } catch (err) {
    next(err);
  }
}

async function runGeneration(
  ctx: Awaited<ReturnType<typeof buildPromptContext>>,
  streamRec: ReturnType<typeof createStream>,
): Promise<void> {
  const timeout = setTimeout(() => {
    streamRec.abort?.abort();
    pushEvent(streamRec, { type: "timeout" });
    finishStream(streamRec);
  }, GENERATION_TIMEOUT_MS);

  try {
    let full = "";
    const onDelta = (text: string) => {
      full += text;
      pushEvent(streamRec, { type: "delta", text });
    };

    const abortSignal = streamRec.abort?.signal;

    try {
      await stream(
        {
          modelId: ctx.modelId,
          messages: ctx.messages,
          temperature: ctx.temperature,
        },
        onDelta,
        abortSignal,
      );
    } catch (err) {
      if (err instanceof ProviderHttpError || abortSignal?.aborted || full) {
        throw err;
      }
      // Only retry network/transport failures, not provider HTTP errors.
      try {
        full = await complete({
          modelId: ctx.modelId,
          messages: ctx.messages,
          temperature: ctx.temperature,
        });
        if (full && !streamRec.finished) {
          pushEvent(streamRec, { type: "delta", text: full });
        }
      } catch {
        throw err;
      }
    }

    // Persist the assistant message only once content exists (a required,
    // non-empty field) — avoids saving empty stubs on early failure.
    let messageId: string | null = null;
    if (full.trim()) {
      const assistantMessage = await Message.create({
        conversationId: ctx.conversationId,
        userId: ctx.userId,
        role: "assistant",
        content: full,
        modelId: ctx.modelId,
      });
      messageId = String(assistantMessage._id);
      await UsageEvent.create({
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        messageId: assistantMessage._id,
        modelId: ctx.modelId,
        promptChars: ctx.messages.reduce((s, m) => s + m.content.length, 0),
        completionChars: full.length,
        source: ctx.documentIds.length > 0 ? "assistant" : "chat",
      });
    }

    if (!streamRec.finished) {
      pushEvent(streamRec, {
        type: "done",
        ...(messageId ? { messageId } : {}),
        text: full,
      });
      finishStream(streamRec);
    }
  } catch (err) {
    if (!streamRec.finished) {
      pushEvent(streamRec, {
        type: "error",
        message: publicErrorMessage(err),
      });
      finishStream(streamRec);
    }
  } finally {
    clearTimeout(timeout);
  }
}

/** Maps internal/provider failures to messages safe to show users. */
function publicErrorMessage(err: unknown): string {
  logger.warn(
    "[generation] failed:",
    err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  );
  if (err instanceof HttpError) return err.message;
  if (err instanceof ProviderHttpError) {
    if (err.status === 429) {
      return "The AI provider is rate-limited or out of quota. Try again shortly or pick another model.";
    }
    if (err.status === 401 || err.status === 403) {
      return "The AI provider rejected the server's credentials. Contact the administrator.";
    }
    if (err.status === 404) return "The selected model is not available from its provider.";
    return "The AI provider returned an error. Try again or pick another model.";
  }
  return "Generation failed. Please try again.";
}

export async function postStop(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED", "Not signed in");
    const parsed = chatStopSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION", "Invalid stream ID");
    }
    const stopped = stopStream(parsed.data.streamId, req.user.id);
    res.json({ success: true, data: { stopped } });
  } catch (err) {
    next(err);
  }
}

/** SSE endpoint — replays buffered events then follows live. */
export function getStreamSse(req: Request, res: Response): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Not signed in" },
    });
    return;
  }
  const streamRec = getStream(String(req.params.streamId));
  if (!streamRec || streamRec.userId !== req.user.id) {
    res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Stream not found" },
    });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`retry: 1000\n\n`);

  let closed = false;
  const send = (ev: unknown) => {
    if (closed) return;
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  };

  // Replay anything already buffered, then subscribe live.
  for (const ev of streamRec.events) send(ev);
  if (streamRec.finished) {
    closed = true;
    res.end();
    return;
  }

  const unsubscribe = subscribe(streamRec, (ev) => send(ev));
  const keepAlive = setInterval(() => {
    if (!closed) res.write(`: keep-alive\n\n`);
  }, 15_000);

  res.on("close", () => {
    closed = true;
    clearInterval(keepAlive);
    unsubscribe();
  });
}
