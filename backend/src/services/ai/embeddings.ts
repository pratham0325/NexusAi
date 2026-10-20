/**
 * Embeddings — OpenAI text-embedding-3-small when keyed, otherwise a
 * deterministic local hashing embedding so RAG works with zero setup.
 */
import { env } from "../../config/env.js";

export const EMBEDDING_DIMS = 512;
/** OpenAI accepts at most 2048 inputs per embeddings request. */
const EMBED_BATCH = 256;
const EMBED_TIMEOUT_MS = 30_000;

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length <= EMBED_BATCH) return embedBatch(texts);
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    out.push(...(await embedBatch(texts.slice(i, i + EMBED_BATCH))));
  }
  return out;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  if (env.OPENAI_API_KEY && texts.length > 0) {
    try {
      const res = await fetch(
        `${env.OPENAI_BASE_URL.replace(/\/$/, "")}/v1/embeddings`,
        {
          method: "POST",
          signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            dimensions: EMBEDDING_DIMS,
            input: texts,
          }),
        },
      );
      if (res.ok) {
        const json = (await res.json()) as { data?: { embedding: number[] }[] };
        if (json.data?.length === texts.length) {
          return json.data.map((d) => d.embedding);
        }
      }
      console.warn("[embeddings] provider failed; using local fallback");
    } catch {
      console.warn("[embeddings] provider unreachable; using local fallback");
    }
  }
  return texts.map(localEmbed);
}

/** Deterministic bag-of-words hashing embedding (no network, no deps). */
function localEmbed(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIMS).fill(0);
  const words = text.toLowerCase().match(/[a-z0-9']{2,}/g) ?? [];
  for (const w of words) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) {
      h ^= w.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    vec[Math.abs(h) % EMBEDDING_DIMS] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}
