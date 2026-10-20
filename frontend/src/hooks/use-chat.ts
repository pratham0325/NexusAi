/** Chat data hooks built on TanStack Query over the Express REST API. */
import { MODELS, DEFAULT_MODEL_ID, modelLabel } from "@/lib/models";
import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
  chatApi,
  conversationsApi,
  settingsApi,
} from "@/api";
import type {
  AssistantWire,
  ConversationWire,
  DocumentWire,
  MessageAttachmentInput,
  MessageWire,
  UserSettingsWire,
} from "@/api/types";
import { toast } from "sonner";

export type Conversation = ConversationWire;
export type Message = MessageWire;
export type Assistant = AssistantWire;
export type DocumentInfo = DocumentWire;
export type Settings = UserSettingsWire;

export { MODELS, DEFAULT_MODEL_ID, modelLabel };

/** Central streaming orchestration shared by the chat page. */
export interface StreamingState {
  conversationId: string;
  text: string;
}

export function useConversations() {
  const query = useQuery({
    queryKey: ["conversations"],
    queryFn: conversationsApi.list,
  });
  return {
    conversations: query.data ?? [],
    isLoading: query.isLoading,
  };
}

export function useMessages(conversationId: string | null) {
  const query = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => conversationsApi.messages(conversationId!),
    enabled: !!conversationId,
  });
  return {
    messages: query.data ?? [],
    isLoading: query.isLoading && !!conversationId,
  };
}

export function useSettings() {
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.get,
    retry: false,
  });
  return query.data;
}

/** Invalidate all conversation-related caches after a mutation. */
function useInvalidateChat() {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["conversations"] });
    void qc.invalidateQueries({ queryKey: ["messages"] });
  }, [qc]);
}

/**
 * Send / edit / regenerate / rate orchestration. Each flow:
 * 1. persists the message via REST,
 * 2. POSTs /api/chat to start generation,
 * 3. opens the SSE stream via onStream(streamId).
 */
export function useChatActions(
  conversationId: string | null,
  setStreaming: (s: StreamingState | null) => void,
  onStream: (streamId: string) => void,
) {
  const invalidate = useInvalidateChat();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (fn: () => Promise<{ streamId: string }>) => {
      setPending(true);
      try {
        const { streamId } = await fn();
        setStreaming({ conversationId: conversationId!, text: "" });
        onStream(streamId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Generation failed");
        setStreaming(null);
      } finally {
        setPending(false);
      }
    },
    [conversationId, setStreaming, onStream],
  );

  const send = useCallback(
    async (content: string, attachments: MessageAttachmentInput[] = []) => {
      if (!conversationId) return;
      setPending(true);
      try {
        await conversationsApi.appendMessage(conversationId, content, attachments);
        invalidate();
        await run(() => chatApi.generate(conversationId));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to send");
        setStreaming(null);
      } finally {
        setPending(false);
      }
    },
    [conversationId, invalidate, run, setStreaming],
  );

  const edit = useCallback(
    async (messageId: string, content: string) => {
      if (!conversationId) return;
      setPending(true);
      try {
        await conversationsApi.editMessage(messageId, content);
        invalidate();
        await run(() => chatApi.generate(conversationId));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to edit");
        setStreaming(null);
      } finally {
        setPending(false);
      }
    },
    [conversationId, invalidate, run, setStreaming],
  );

  const regenerateLast = useCallback(async () => {
    if (!conversationId) return;
    setPending(true);
    try {
      await conversationsApi.regenerate(conversationId);
      invalidate();
      await run(() => chatApi.generate(conversationId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to regenerate");
      setStreaming(null);
    } finally {
      setPending(false);
    }
  }, [conversationId, invalidate, run, setStreaming]);

  const rate = useCallback(
    async (messageId: string, rating: "up" | "down" | undefined) => {
      try {
        await conversationsApi.rateMessage(
          messageId,
          rating === undefined ? null : rating,
        );
        void qc.invalidateQueries({ queryKey: ["messages"] });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to rate");
      }
    },
    [qc],
  );

  return { send, edit, regenerateLast, rate, pending };
}
