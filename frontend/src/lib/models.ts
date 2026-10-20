/** Model registry shared by the chat selector and settings. */
export interface ModelInfo {
  id: string;
  label: string;
  provider: "openai" | "google" | "groq" | "local";
  family: string;
  contextWindow: number;
  description: string;
  tier: "free" | "pro";
  supportsVision: boolean;
}

export const MODELS: ModelInfo[] = [
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    provider: "openai",
    family: "OpenAI",
    contextWindow: 128000,
    description: "Fast, affordable everyday model — great default.",
    tier: "free",
    supportsVision: true,
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    provider: "openai",
    family: "OpenAI",
    contextWindow: 128000,
    description: "Flagship multimodal model with top reasoning.",
    tier: "pro",
    supportsVision: true,
  },
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    provider: "openai",
    family: "OpenAI",
    contextWindow: 1000000,
    description: "Long-context workhorse for large documents.",
    tier: "free",
    supportsVision: true,
  },
  {
    id: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    provider: "google",
    family: "Google",
    contextWindow: 1000000,
    description: "Google's latest fast Gemini model.",
    tier: "free",
    supportsVision: true,
  },
  {
    id: "openai/gpt-oss-120b",
    label: "GPT-OSS 120B",
    provider: "groq",
    family: "Groq",
    contextWindow: 131072,
    description: "High-capability reasoning model hosted on Groq.",
    tier: "free",
    supportsVision: false,
  },
  {
    id: "openai/gpt-oss-20b",
    label: "GPT-OSS 20B",
    provider: "groq",
    family: "Groq",
    contextWindow: 131072,
    description: "Fast, efficient reasoning model hosted on Groq.",
    tier: "free",
    supportsVision: false,
  },
  {
    id: "qwen/qwen3.8-27b",
    label: "Qwen 3.8 27B",
    provider: "groq",
    family: "Groq",
    contextWindow: 131072,
    description: "Multimodal reasoning model with image understanding.",
    tier: "free",
    supportsVision: true,
  },
  {
    id: "nexus-demo",
    label: "Nexus Demo",
    provider: "local",
    family: "Nexus",
    contextWindow: 32000,
    description: "Local simulated model — works with zero API keys.",
    tier: "free",
    supportsVision: false,
  },
];

export const DEFAULT_MODEL_ID = "qwen/qwen3.8-27b";
export const DEMO_MODEL_ID = "nexus-demo";

export function getModel(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === canonicalModelId(id));
}

const LEGACY_MODEL_IDS: Record<string, string> = {
  "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
  "llama-3.1-8b-instant": "openai/gpt-oss-20b",
  "gemini-3.6-flash": "gemini-3.8-flash",
};

export function canonicalModelId(id: string): string {
  return LEGACY_MODEL_IDS[id] ?? id;
}

export function modelLabel(id: string): string {
  return getModel(id)?.label ?? id;
}

export function isValidModelId(id: string): boolean {
  return getModel(id) !== undefined;
}
