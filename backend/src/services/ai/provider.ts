/**
 * AI provider abstraction. Priority: VLY gateway (auto-provisioned) →
 * OpenAI / Gemini / OpenAI-compatible (via env keys) → built-in demo model
 * so every feature works with zero keys.
 */
import { env } from "../../config/env.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content:
    | string
    | (
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      )[];
}

export interface GenerateOptions {
  modelId: string;
  messages: ChatMessage[];
  temperature: number;
}

interface VlyCompletionResponse {
  success?: boolean;
  data?: { content?: string; text?: string };
  choices?: { message?: { content?: string } }[];
  error?: string;
}

interface ProviderEndpoint {
  url: string;
  key: string;
  model: string;
}

/** Hard ceiling for a single non-streaming provider request. */
const COMPLETE_TIMEOUT_MS = 90_000;

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

const GROQ_MODEL_IDS = new Set([
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
]);

const LEGACY_GROQ_MODEL_IDS: Record<string, string> = {
  "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
  "llama-3.1-8b-instant": "openai/gpt-oss-20b",
};

const LEGACY_MODEL_IDS: Record<string, string> = {
  ...LEGACY_GROQ_MODEL_IDS,
  "gemini-3.6-flash": "gemini-3.8-flash",
};

const MODELS_BY_PROVIDER = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
  google: ["gemini-3.8-flash"],
  groq: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"],
  local: ["nexus-demo"],
} as const;

export function canonicalModelId(modelId: string): string {
  return LEGACY_MODEL_IDS[modelId] ?? modelId;
}

export function getAvailableAiModels(): {
  modelIds: string[];
  recommendedDefaultModelId: string;
} {
  const modelIds: string[] = [];
  if (env.OPENAI_API_KEY || env.VLY_INTEGRATION_KEY) {
    modelIds.push(...MODELS_BY_PROVIDER.openai);
  }
  if (env.GOOGLE_AI_API_KEY) modelIds.push(...MODELS_BY_PROVIDER.google);
  if (env.GROQ_API_KEY) modelIds.push(...MODELS_BY_PROVIDER.groq);
  if (modelIds.length === 0) modelIds.push(...MODELS_BY_PROVIDER.local);

  const configuredDefault = canonicalModelId(env.DEFAULT_AI_MODEL);
  const recommendedDefaultModelId =
    env.DEFAULT_AI_MODEL !== "gemini-3.6-flash" &&
    modelIds.includes(configuredDefault)
      ? configuredDefault
      : modelIds.includes("qwen/qwen3.8-27b")
        ? "qwen/qwen3.8-27b"
        : modelIds.includes("gemini-3.8-flash")
          ? "gemini-3.8-flash"
          : modelIds.includes("gpt-4o-mini")
            ? "gpt-4o-mini"
            : "nexus-demo";

  return { modelIds, recommendedDefaultModelId };
}

/** Resolves the selected model; retired Groq IDs map to documented successors. */
function resolveEndpoint(modelId: string): ProviderEndpoint | null {
  const selectedModelId = canonicalModelId(modelId);
  if (selectedModelId === "nexus-demo") return null;

  if (GROQ_MODEL_IDS.has(selectedModelId)) {
    if (!env.GROQ_API_KEY) {
      throw new Error("Groq model selected but GROQ_API_KEY is not configured");
    }
    return {
      url: `${env.GROQ_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`,
      key: env.GROQ_API_KEY,
      model: selectedModelId,
    };
  }

  if (selectedModelId === "gemini-3.8-flash") {
    if (!env.GOOGLE_AI_API_KEY) {
      throw new Error("Gemini model selected but GOOGLE_AI_API_KEY is not configured");
    }
    return {
      url: `${env.GOOGLE_AI_BASE_URL.replace(/\/$/, "")}/v1beta/openai/chat/completions`,
      key: env.GOOGLE_AI_API_KEY,
      model: selectedModelId,
    };
  }

  if (
    !MODELS_BY_PROVIDER.openai.includes(
      selectedModelId as (typeof MODELS_BY_PROVIDER.openai)[number],
    )
  ) {
    throw new Error(`Unsupported AI model: ${modelId}`);
  }

  // Platform-managed gateway or OpenAI-compatible endpoint for GPT models.
  if (env.VLY_INTEGRATION_KEY) {
    return {
      url: `${env.VLY_INTEGRATION_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`,
      key: env.VLY_INTEGRATION_KEY,
      model: selectedModelId,
    };
  }
  if (env.OPENAI_API_KEY) {
    return {
      url: `${env.OPENAI_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`,
      key: env.OPENAI_API_KEY,
      model: selectedModelId,
    };
  }
  throw new Error("OpenAI model selected but OPENAI_API_KEY is not configured");
}

/** Single-shot completion (non-streaming). */
export async function complete(opts: GenerateOptions): Promise<string> {
  const endpoint = resolveEndpoint(opts.modelId);
  if (!endpoint) return demoComplete(opts);

  const res = await fetch(endpoint.url, {
    method: "POST",
    signal: AbortSignal.timeout(COMPLETE_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${endpoint.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: endpoint.model,
      messages: opts.messages,
      temperature: opts.temperature,
      max_tokens: env.MAX_OUTPUT_TOKENS,
    }),
  });
  if (!res.ok)
    throw new ProviderHttpError(`AI provider error ${res.status}`, res.status);
  const json = (await res.json()) as VlyCompletionResponse;
  return (
    json.choices?.[0]?.message?.content ??
    json.data?.content ??
    json.data?.text ??
    ""
  );
}

/** Streaming completion — invokes onDelta per text chunk. */
export async function stream(
  opts: GenerateOptions,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const endpoint = resolveEndpoint(opts.modelId);
  if (!endpoint) return demoStream(opts, onDelta, signal);

  const res = await fetch(endpoint.url, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${endpoint.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: endpoint.model,
      messages: opts.messages,
      temperature: opts.temperature,
      max_tokens: env.MAX_OUTPUT_TOKENS,
      stream: true,
    }),
  });
  if (!res.ok)
    throw new ProviderHttpError(`AI provider error ${res.status}`, res.status);
  if (!res.body)
    throw new ProviderHttpError(
      "AI provider returned an empty response",
      res.status,
    );

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let sse = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    sse += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = sse.indexOf("\n")) !== -1) {
      const line = sse.slice(0, idx).trim();
      sse = sse.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        // ignore malformed SSE lines
      }
    }
  }
  return full;
}

/* ─── Demo model (zero-key fallback) ─────────────────────────────────── */

function demoComplete(opts: GenerateOptions): string {
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  return demoAnswer(messageText(lastUser?.content) || "Hello");
}

async function demoStream(
  opts: GenerateOptions,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  const answer = demoAnswer(messageText(lastUser?.content) || "Hello");
  // Stream word-by-word with small delays for a realistic feel.
  const tokens = answer.match(/\S+\s*/g) ?? [answer];
  for (const tok of tokens) {
    if (signal?.aborted) break;
    onDelta(tok);
    await new Promise((r) => setTimeout(r, 18));
  }
  return answer;
}

function messageText(content: ChatMessage["content"] | undefined): string {
  if (typeof content === "string") return content;
  return (
    content
      ?.filter(
        (part): part is { type: "text"; text: string } => part.type === "text",
      )
      .map((part) => part.text)
      .join("\n") ?? ""
  );
}

/** Composes a contextual demo answer (echoes structure, cites RAG context). */
function demoAnswer(userText: string): string {
  const t = userText.trim();
  const ctxMatch = t.match(/\[Context: ([^\]]+)\]/);
  if (ctxMatch) {
    const excerpt = ctxMatch[1].slice(0, 220);
    return [
      `Based on your documents, here's what I found:`,
      ``,
      `> ${excerpt}${ctxMatch[1].length > 220 ? "…" : ""}`,
      ``,
      `**Summary:** The retrieved passage directly addresses your question. This answer was grounded in the uploaded document via RAG retrieval — the demo model simulates a fully grounded response.`,
      ``,
      `_You're seeing the built-in **Nexus Demo** model. Add an \`OPENAI_API_KEY\` or \`GOOGLE_AI_API_KEY\` to unlock production models._`,
    ].join("\n");
  }

  if (/^(hi|hello|hey|yo)\b/i.test(t)) {
    return `Hey! 👋 I'm **Nexus**, your AI workspace assistant. I can help you think, write, code and learn.\n\nTry asking me to draft an email, explain a concept, or upload a document and ask me about it.\n\n_(Demo model — add an AI provider key for full-quality responses.)_`;
  }

  const topic = t.replace(/\?+$/, "").trim();
  const short = topic.length > 140 ? `${topic.slice(0, 140)}…` : topic;
  return [
    `Here's a quick take on **${short}**:`,
    ``,
    `1. **Core idea** — break the problem into its smallest moving parts and handle each explicitly.`,
    `2. **Practical step** — start with the simplest version that works end-to-end, then iterate.`,
    `3. **Watch out for** — edge cases around inputs, and keeping state predictable.`,
    ``,
    `_(Demo model response — add an \`OPENAI_API_KEY\` or \`GOOGLE_AI_API_KEY\` for production-quality answers.)_`,
  ].join("\n");
}
