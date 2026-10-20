/**
 * Environment config — reads .env (dotenv), falls back to dev-safe defaults.
 * Production refuses to start with missing, placeholder or unsafe values.
 * Also honors VLY integration AI keys automatically when present.
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV !== "test") {
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
}

const DEV_ACCESS_SECRET = "nexus-dev-access-secret-change-me";
const DEV_REFRESH_SECRET = "nexus-dev-refresh-secret-change-me";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.string().default("development"),
  MONGODB_URI: z.string().default(""),
  JWT_ACCESS_SECRET: z.string().min(8).default(DEV_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z.string().min(8).default(DEV_REFRESH_SECRET),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  CLIENT_URL: z.string().default("http://localhost:5173"),
  /** SameSite for session cookies. "none" is needed when the frontend and API
   *  are on different sites (e.g. *.vercel.app + *.onrender.com). */
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).optional(),
  /** Number of reverse proxies in front of the API (for client IPs). */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  ADMIN_EMAILS: z.string().default(""),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com"),
  GOOGLE_AI_API_KEY: z.string().optional(),
  GOOGLE_AI_BASE_URL: z
    .string()
    .url()
    .default("https://generativelanguage.googleapis.com"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.string().url().default("https://api.groq.com/openai"),
  DEFAULT_AI_MODEL: z.string().default("qwen/qwen3.8-27b"),
  /** Upper bound on generated tokens per reply (cost control). */
  MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(32_000).default(2048),
  /** Concurrent generations allowed per user. */
  MAX_CONCURRENT_GENERATIONS: z.coerce.number().int().min(1).max(20).default(2),
  RESEND_API_KEY: z.string().optional(),
  OTP_FROM_EMAIL: z.string().default("onboarding@resend.dev"),
  ENABLE_DEV_OTP: z.string().optional(),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(7),
});

// Treat blank entries (e.g. `COOKIE_SAMESITE=` copied from .env.example) as
// unset so they fall back to defaults instead of failing validation.
const parsed = schema.safeParse(
  Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ""),
  ),
);
if (!parsed.success) {
  // Field names only — never echo submitted values (they may be secrets).
  console.error(
    "Invalid backend environment:",
    Object.keys(parsed.error.flatten().fieldErrors),
  );
  process.exit(1);
}

const e = parsed.data;

function looksLikePlaceholder(secret: string): boolean {
  return /replace|change-?me|example|placeholder|secret-at-least/i.test(secret);
}

const clientOrigins = e.CLIENT_URL.split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);
if (e.NODE_ENV !== "production") {
  // Local dev: accept the Vite dev server on either loopback name.
  for (const devOrigin of ["http://localhost:5173", "http://127.0.0.1:5173"]) {
    if (!clientOrigins.includes(devOrigin)) clientOrigins.push(devOrigin);
  }
}

const productionEnvErrors: string[] = [];
if (e.NODE_ENV === "production") {
  if (!e.MONGODB_URI) productionEnvErrors.push("MONGODB_URI");
  for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const) {
    if (
      !process.env[key] ||
      e[key].length < 32 ||
      looksLikePlaceholder(e[key])
    ) {
      productionEnvErrors.push(`${key} (random, at least 32 characters)`);
    }
  }
  if (e.JWT_ACCESS_SECRET === e.JWT_REFRESH_SECRET) {
    productionEnvErrors.push("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ");
  }
  if (!process.env.CLIENT_URL || clientOrigins.length === 0) {
    productionEnvErrors.push("CLIENT_URL");
  }
  for (const origin of clientOrigins) {
    let url: URL | null = null;
    try {
      url = new URL(origin);
    } catch {
      url = null;
    }
    if (!url || url.origin !== origin || origin === "*") {
      productionEnvErrors.push(`CLIENT_URL entry is not a valid origin: ${origin}`);
    } else if (
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    ) {
      productionEnvErrors.push(`CLIENT_URL must use https in production: ${origin}`);
    }
  }
  if (e.ENABLE_DEV_OTP === "true")
    productionEnvErrors.push("ENABLE_DEV_OTP must not be true");
}
if (productionEnvErrors.length > 0) {
  console.error(
    "Missing or unsafe production environment:",
    productionEnvErrors,
  );
  process.exit(1);
}

const isProduction = e.NODE_ENV === "production";

export const env = {
  PORT: e.PORT,
  NODE_ENV: e.NODE_ENV,
  MONGODB_URI: e.MONGODB_URI,
  JWT_ACCESS_SECRET: e.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: e.JWT_REFRESH_SECRET,
  ACCESS_TOKEN_TTL_MINUTES: e.ACCESS_TOKEN_TTL_MINUTES,
  CLIENT_URL: e.CLIENT_URL,
  CLIENT_ORIGINS: clientOrigins,
  COOKIE_SAMESITE: e.COOKIE_SAMESITE ?? (isProduction ? "none" : "lax"),
  TRUST_PROXY: e.TRUST_PROXY,
  ADMIN_EMAILS: e.ADMIN_EMAILS,
  OPENAI_API_KEY: e.OPENAI_API_KEY,
  OPENAI_BASE_URL: e.OPENAI_BASE_URL,
  GOOGLE_AI_API_KEY: e.GOOGLE_AI_API_KEY,
  GOOGLE_AI_BASE_URL: e.GOOGLE_AI_BASE_URL,
  GROQ_API_KEY: e.GROQ_API_KEY,
  GROQ_BASE_URL: e.GROQ_BASE_URL,
  DEFAULT_AI_MODEL: e.DEFAULT_AI_MODEL,
  MAX_OUTPUT_TOKENS: e.MAX_OUTPUT_TOKENS,
  MAX_CONCURRENT_GENERATIONS: e.MAX_CONCURRENT_GENERATIONS,
  RESEND_API_KEY: e.RESEND_API_KEY,
  OTP_FROM_EMAIL: e.OTP_FROM_EMAIL,
  REFRESH_TOKEN_TTL_DAYS: e.REFRESH_TOKEN_TTL_DAYS,
  /** Dev OTP surface (console + verify response) — dev only, opt-out via ENABLE_DEV_OTP=false */
  DEV_OTP: !isProduction && process.env.ENABLE_DEV_OTP !== "false",
  /** VLY-managed AI gateway (auto-provisioned by the platform). */
  VLY_INTEGRATION_KEY: process.env.VLY_INTEGRATION_KEY,
  VLY_INTEGRATION_BASE_URL:
    process.env.VLY_INTEGRATION_BASE_URL || "https://integrations.freebuff.com",
};

export const isProd = isProduction;
