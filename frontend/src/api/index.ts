/** API modules — one file per backend domain, all via the shared axios client. */

import { api, tokenStore, unwrap } from "./client";
import type {
  AdminStatsWire,
  AvailableModelsWire,
  AssistantWire,
  ConversationWire,
  DocumentWire,
  MessageAttachmentInput,
  MessageWire,
  UsageSummaryWire,
  UserSettingsWire,
  UserWire,
} from "./types";

/* ─── Auth ──────────────────────────────────────────────────────────── */

export interface AuthResult {
  user: UserWire;
  isNewUser?: boolean;
}

export const modelsApi = {
  available: () => unwrap<AvailableModelsWire>(api.get("/models")),
};

export const authApi = {
  register: (body: { name: string; email: string; password: string }) =>
    unwrap<AuthResult>(api.post("/auth/register", body)),
  login: (body: { email: string; password: string }) =>
    unwrap<AuthResult>(api.post("/auth/login", body)),
  requestOtp: (email: string) =>
    unwrap<{ sent: boolean; devOtp?: string | null }>(
      api.post("/auth/request-otp", { email }),
    ),
  verifyOtp: (email: string, code: string) =>
    unwrap<AuthResult>(api.post("/auth/verify-otp", { email, code })),
  guest: () => unwrap<AuthResult>(api.post("/auth/guest")),
  refresh: () =>
    unwrap<{ user: UserWire }>(api.post("/auth/refresh")),
  logout: async () => {
    try {
      return await unwrap<{ signedOut: boolean }>(api.post("/auth/logout"));
    } finally {
      // Drop Bearer fallback tokens even if the request failed.
      tokenStore.clear();
    }
  },
  me: () => unwrap<{ user: UserWire }>(api.get("/auth/me")),
};

/* ─── Conversations & messages ──────────────────────────────────────── */

export const conversationsApi = {
  list: () => unwrap<ConversationWire[]>(api.get("/conversations")),
  search: (q: string) =>
    unwrap<ConversationWire[]>(
      api.get("/conversations/search", { params: { q } }),
    ),
  get: (id: string) =>
    unwrap<ConversationWire>(api.get(`/conversations/${id}`)),
  create: (
    body: { title?: string; modelId?: string; assistantId?: string } = {},
  ) => unwrap<ConversationWire>(api.post("/conversations", body)),
  rename: (id: string, title: string) =>
    unwrap<ConversationWire>(api.patch(`/conversations/${id}`, { title })),
  setPinned: (id: string, pinned: boolean) =>
    unwrap<ConversationWire>(api.patch(`/conversations/${id}`, { pinned })),
  setArchived: (id: string, archived: boolean) =>
    unwrap<ConversationWire>(api.patch(`/conversations/${id}`, { archived })),
  setModel: (id: string, modelId: string) =>
    unwrap<ConversationWire>(api.patch(`/conversations/${id}`, { modelId })),
  remove: (id: string) =>
    unwrap<{ deleted: boolean }>(api.delete(`/conversations/${id}`)),
  messages: (id: string) =>
    unwrap<MessageWire[]>(api.get(`/conversations/${id}/messages`)),
  appendMessage: (
    id: string,
    content: string,
    attachments: MessageAttachmentInput[] = [],
  ) =>
    unwrap<MessageWire>(
      api.post(`/conversations/${id}/messages`, { content, attachments }),
    ),
  editMessage: (messageId: string, content: string) =>
    unwrap<MessageWire>(api.patch(`/messages/${messageId}`, { content })),
  rateMessage: (messageId: string, rating: "up" | "down" | null) =>
    unwrap<MessageWire>(api.patch(`/messages/${messageId}/rating`, { rating })),
  regenerate: (id: string) =>
    unwrap<{ ok: boolean }>(api.post(`/conversations/${id}/regenerate`)),
};

/* ─── Generation + streaming ────────────────────────────────────────── */

export const chatApi = {
  /** Starts generation for a conversation; returns the SSE streamId. */
  generate: (conversationId: string) =>
    unwrap<{ streamId: string }>(api.post("/chat", { conversationId })),
  stop: (streamId: string) =>
    unwrap<{ stopped: boolean }>(api.post("/chat/stop", { streamId })),
};

/* ─── Assistants ────────────────────────────────────────────────────── */

export interface AssistantInput {
  name: string;
  description: string;
  systemPrompt: string;
  modelId: string;
  temperature: number;
  emoji: string;
  documentIds: string[];
}

export const assistantsApi = {
  list: () => unwrap<AssistantWire[]>(api.get("/assistants")),
  get: (id: string) => unwrap<AssistantWire>(api.get(`/assistants/${id}`)),
  create: (body: AssistantInput) =>
    unwrap<AssistantWire>(api.post("/assistants", body)),
  update: (id: string, body: Partial<AssistantInput>) =>
    unwrap<AssistantWire>(api.patch(`/assistants/${id}`, body)),
  remove: (id: string) =>
    unwrap<{ deleted: boolean }>(api.delete(`/assistants/${id}`)),
};

/* ─── Documents (RAG) ───────────────────────────────────────────────── */

export const documentsApi = {
  list: () => unwrap<DocumentWire[]>(api.get("/documents")),
  ingest: (body: {
    name: string;
    mimeType: string;
    size: number;
    text: string;
  }) => unwrap<DocumentWire>(api.post("/documents", body)),
  remove: (id: string) =>
    unwrap<{ deleted: boolean }>(api.delete(`/documents/${id}`)),
};

/* ─── Settings ──────────────────────────────────────────────────────── */

export const settingsApi = {
  get: () => unwrap<UserSettingsWire>(api.get("/settings")),
  update: (body: Partial<Omit<UserSettingsWire, "_id" | "userId">>) =>
    unwrap<UserSettingsWire>(api.patch("/settings", body)),
};

/* ─── Usage analytics + admin ───────────────────────────────────────── */

export const usageApi = {
  summary: () => unwrap<UsageSummaryWire>(api.get("/usage")),
  adminStats: () => unwrap<AdminStatsWire | null>(api.get("/admin/stats")),
  claimAdmin: () =>
    unwrap<{ claimed: boolean; message?: string }>(api.post("/admin/claim")),
};
