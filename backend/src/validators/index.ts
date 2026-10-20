/** Zod request validators — one schema per endpoint body/params. */
import { z } from "zod";

const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128);

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

export const requestOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

const modelId = z.string().trim().min(1).max(80);

export const conversationCreateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  modelId: modelId.optional(),
  assistantId: z.string().trim().regex(/^[a-f0-9]{24}$/i).optional(),
});

export const conversationPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
    modelId: modelId.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

const messageAttachmentSchema = z.discriminatedUnion("kind", [
  z.object({
    name: z.string().trim().min(1).max(255),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    kind: z.literal("image"),
    content: z
      .string()
      .max(10_000_000)
      .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/),
  }),
  z.object({
    name: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().max(120),
    kind: z.literal("text"),
    content: z.string().min(1).max(250_000),
  }),
]);

export const messageAppendSchema = z
  .object({
    content: z.string().trim().max(32_000).default(""),
    attachments: z.array(messageAttachmentSchema).max(5).default([]),
  })
  .refine((value) => value.content.length > 0 || value.attachments.length > 0, {
    message: "Add a message or attachment",
  })
  .refine(
    (value) =>
      value.attachments
        .filter((attachment) => attachment.kind === "text")
        .reduce((total, attachment) => total + attachment.content.length, 0) <=
      250_000,
    { message: "Attached text exceeds the 250,000 character limit" },
  )
  .refine(
    (value) =>
      value.attachments
        .filter((attachment) => attachment.kind === "image")
        .reduce((total, attachment) => total + attachment.content.length, 0) <=
      10_000_000,
    { message: "Attached images exceed the upload size limit" },
  );

export const messageEditSchema = z.object({
  content: z.string().trim().min(1, "Message cannot be empty").max(32_000),
});

export const ratingSchema = z.object({
  rating: z.union([z.literal("up"), z.literal("down"), z.literal(null)]),
});

export const chatGenerateSchema = z.object({
  conversationId: z.string().regex(/^[a-f0-9]{24}$/i),
});

export const chatStopSchema = z.object({
  streamId: z.string().uuid(),
});

export const assistantCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(""),
  systemPrompt: z.string().trim().max(8_000).default(""),
  modelId: modelId.default("qwen/qwen3.8-27b"),
  temperature: z.coerce.number().min(0).max(2).default(0.7),
  emoji: z.string().trim().max(8).default("🤖"),
  documentIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(50).default([]),
});

export const assistantPatchSchema = assistantCreateSchema.partial();

export const documentIngestSchema = z.object({
  name: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(120).default("text/plain"),
  size: z.coerce
    .number()
    .int()
    .min(0)
    .max(32 * 1024 * 1024),
  // ~1,500 chunks at the RAG chunk size; larger documents are rejected.
  text: z.string().max(1_500_000),
});

export const settingsPatchSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  defaultModelId: modelId.optional(),
  temperature: z.coerce.number().min(0).max(2).optional(),
  streamingEnabled: z.boolean().optional(),
  emailUpdates: z.boolean().optional(),
});
