/** Shared wire-format types mirrored from the backend (backend/src/types). */

export interface UserWire {
  _id: string;
  name: string | null;
  email: string | null;
  role: "admin" | "user" | "member";
  isAnonymous: boolean;
}

export interface ConversationWire {
  _id: string;
  userId: string;
  title: string;
  modelId: string;
  assistantId: string | null;
  pinned: boolean;
  archived: boolean;
  lastMessageAt: number;
  createdAt: number;
}

export interface MessageWire {
  _id: string;
  conversationId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  attachments: MessageAttachmentWire[];
  modelId: string | null;
  rating: "up" | "down" | null;
  editedAt: number | null;
  createdAt: number;
}

export interface MessageAttachmentWire {
  name: string;
  mimeType: string;
  kind: "image" | "text";
}

export interface MessageAttachmentInput extends MessageAttachmentWire {
  content: string;
}

export interface AvailableModelsWire {
  modelIds: string[];
  recommendedDefaultModelId: string;
}

export interface AssistantWire {
  _id: string;
  userId: string;
  name: string;
  description: string;
  systemPrompt: string;
  modelId: string;
  temperature: number;
  emoji: string;
  documentIds: string[];
  createdAt: number;
}

export interface DocumentWire {
  _id: string;
  userId: string;
  name: string;
  mimeType: string;
  size: number;
  status: "processing" | "ready" | "failed";
  error: string | null;
  chunkCount: number;
  charCount: number;
  createdAt: number;
}

export interface UserSettingsWire {
  _id: string | null;
  userId: string;
  theme: "light" | "dark" | "system";
  defaultModelId: string;
  temperature: number;
  streamingEnabled: boolean;
  emailUpdates: boolean;
}

export interface UsageSummaryWire {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  totalConversations: number;
  totalAssistants: number;
  totalDocuments: number;
  totalCompletionChars: number;
  days: { date: string; messages: number; chars: number }[];
  modelBreakdown: { modelId: string; count: number }[];
}

export interface AdminStatsWire {
  totalUsers: number;
  totalGenerations: number;
  totalChars: number;
  modelBreakdown: { modelId: string; count: number }[];
  days: { date: string; messages: number }[];
  users: {
    _id: string;
    name: string;
    email: string;
    role: string;
    isAnonymous: boolean;
  }[];
}
