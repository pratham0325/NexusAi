import { Markdown } from "@/components/chat/Markdown";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ModelSelector } from "@/components/chat/ModelSelector";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { modelLabel } from "@/lib/models";
import { useAuth } from "@/hooks/use-auth";
import type { MessageAttachmentInput } from "@/api/types";
import {
  ACCEPT_ATTR,
  IMAGE_TYPES,
  MAX_CHAT_IMAGE_BYTES,
  MAX_CHAT_TEXT_CHARS,
  MAX_FILE_BYTES,
  extractText,
  formatBytes,
  isSupportedChatDocument,
  isSupportedChatImage,
} from "@/lib/extract";
import {
  useChatActions,
  useMessages,
  type StreamingState,
} from "@/hooks/use-chat";
import { chatApi, conversationsApi, settingsApi } from "@/api";
import { streamGeneration } from "@/lib/stream";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  Bot,
  FileText,
  Image as ImageIcon,
  Plus,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";

const SUGGESTIONS = [
  {
    icon: "✍️",
    title: "Draft a launch email",
    prompt:
      "Draft a concise launch email for a new AI note-taking app, with a subject line and 3 bullet points.",
  },
  {
    icon: "🧠",
    title: "Explain a concept",
    prompt: "Explain vector embeddings and RAG like I'm a smart beginner.",
  },
  {
    icon: "💻",
    title: "Write some code",
    prompt: "Write a TypeScript function that debounces an async call.",
  },
  {
    icon: "📚",
    title: "Summarize a document",
    prompt:
      "I'll upload a PDF — help me summarize its key points into bullet notes.",
  },
];

interface PendingAttachment extends MessageAttachmentInput {
  id: string;
  size: number;
}

export default function Chat() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [streamId, setStreamId] = useState<string | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const activeId = conversationId ?? null;
  const { messages, isLoading: messagesLoading } = useMessages(activeId);
  const conversation = useQuery({
    queryKey: ["conversation", activeId],
    queryFn: () => conversationsApi.get(activeId!),
    enabled: !!activeId,
  });
  // Model picked on the new-chat screen, before a conversation exists.
  // Null means "use the saved default from Settings".
  const [draftModelId, setDraftModelId] = useState<string | null>(null);
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.get,
    enabled: !activeId,
  });

  const { send, edit, regenerateLast, rate, pending } = useChatActions(
    activeId,
    setStreaming,
    (id) => {
      streamIdRef.current = id;
      setStreamId(id);
    },
  );

  const invalidateChat = () => {
    void qc.invalidateQueries({ queryKey: ["messages"] });
    void qc.invalidateQueries({ queryKey: ["conversations"] });
    if (activeId) void qc.invalidateQueries({ queryKey: ["conversation", activeId] });
  };

  // Auto-scroll on new content.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming?.text]);

  // SSE stream of the active generation.
  useEffect(() => {
    if (!streamId || !activeId) return;
    const controller = new AbortController();
    let cancelled = false;

    void streamGeneration(
      streamId,
      {
        onDelta: (text) => {
          if (!cancelled) setStreaming({ conversationId: activeId, text });
        },
        onDone: () => {
          if (!cancelled) {
            setStreaming(null);
            setStreamId(null);
            streamIdRef.current = null;
            invalidateChat();
          }
        },
        onError: (m) => {
          if (!cancelled) {
            toast.error(m);
            setStreaming(null);
            setStreamId(null);
            streamIdRef.current = null;
            invalidateChat();
          }
        },
      },
      controller.signal,
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId, activeId]);

  const handleSend = async () => {
    const typedContent = input.trim();
    if (!typedContent && attachments.length === 0) return;
    const content =
      typedContent ||
      "Please analyze the attached file(s) and help me understand them.";
    const submittedAttachments: MessageAttachmentInput[] = attachments.map(
      ({ name, mimeType, kind, content }) => ({
        name,
        mimeType,
        kind,
        content,
      }),
    );

    if (!activeId) {
      try {
        const convo = await conversationsApi.create(
          draftModelId ? { modelId: draftModelId } : {},
        );
        await conversationsApi.appendMessage(
          convo._id,
          content,
          submittedAttachments,
        );
        setInput("");
        setAttachments([]);
        navigate(`/dashboard/c/${convo._id}`, { replace: true });
        setStreaming({ conversationId: convo._id, text: "" });
        const { streamId: sid } = await chatApi.generate(convo._id);
        streamIdRef.current = sid;
        setStreamId(sid);
        invalidateChat();
      } catch (err) {
        setStreaming(null);
        toast.error(err instanceof Error ? err.message : "Failed to send");
      }
      return;
    }
    setInput("");
    setAttachments([]);
    await send(content, submittedAttachments);
  };

  const handleFiles = async (files: FileList | File[]) => {
    let staged = [...attachments];
    for (const file of Array.from(files)) {
      if (staged.length >= 5) {
        toast.error("You can attach up to 5 files per message");
        break;
      }
      const isImage = isSupportedChatImage(file);
      const isDocument = isSupportedChatDocument(file);
      if (!isImage && !isDocument) {
        toast.error(`${file.name}: supported files are PDF, DOCX, TXT, MD, CSV, PNG, JPG and WebP`);
        continue;
      }
      const maxSize = isImage ? MAX_CHAT_IMAGE_BYTES : MAX_FILE_BYTES;
      if (file.size > maxSize) {
        toast.error(
          `${file.name} is larger than ${formatBytes(maxSize)}`,
        );
        continue;
      }

      try {
        const mimeType = getAttachmentMimeType(file);
        let kind: MessageAttachmentInput["kind"];
        let content: string;
        if (isImage) {
          if (!IMAGE_TYPES.includes(mimeType as (typeof IMAGE_TYPES)[number])) {
            toast.error(`${file.name}: use a PNG, JPG or WebP image`);
            continue;
          }
          kind = "image";
          content = await readImageDataUrl(file, mimeType);
          const stagedImageChars = staged
            .filter((attachment) => attachment.kind === "image")
            .reduce((sum, attachment) => sum + attachment.content.length, 0);
          if (stagedImageChars + content.length > 10_000_000) {
            toast.error("Attached images exceed the total upload size limit");
            continue;
          }
        } else {
          kind = "text";
          content = await extractText(file);
          if (!content.trim()) {
            throw new Error("No extractable text found in this file");
          }
          const stagedTextChars = staged
            .filter((attachment) => attachment.kind === "text")
            .reduce((sum, attachment) => sum + attachment.content.length, 0);
          if (stagedTextChars + content.length > MAX_CHAT_TEXT_CHARS) {
            toast.error("Attached text exceeds the 250,000 character limit");
            continue;
          }
        }
        staged = [
          ...staged,
          {
            id: `${Date.now()}-${Math.random()}`,
            name: file.name,
            mimeType,
            kind,
            content,
            size: file.size,
          },
        ];
        setAttachments(staged);
      } catch (err) {
        toast.error(
          err instanceof Error ? `${file.name}: ${err.message}` : `Failed to read ${file.name}`,
        );
      }
    }
  };

  const handleStop = () => {
    if (streamIdRef.current) {
      void chatApi.stop(streamIdRef.current).catch(() => undefined);
    }
    setStreaming(null);
    setStreamId(null);
    streamIdRef.current = null;
    invalidateChat();
  };

  const handleModelChange = async (modelId: string) => {
    if (!activeId) {
      setDraftModelId(modelId);
      return;
    }
    try {
      await conversationsApi.setModel(activeId, modelId);
      invalidateChat();
      toast.success(`Switched to ${modelLabel(modelId)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const streamingForThisChat = streaming?.conversationId === activeId;
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");

  return (
    <AppLayout>
      <div className="flex h-full flex-col">
        {/* Header */}
        <header className="flex items-center gap-2 border-b border-border/70 px-4 py-2.5">
          <h1 className="min-w-0 flex-1 truncate font-display text-sm font-semibold">
            {conversation.data?.title ?? "New chat"}
          </h1>
          <ModelSelector
            value={
              activeId
                ? (conversation.data?.modelId ?? "gpt-4o-mini")
                : (draftModelId ?? settings.data?.defaultModelId ?? "")
            }
            onChange={handleModelChange}
          />
        </header>

        {/* Messages */}
        <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
            {messagesLoading && (
              <div className="space-y-4">
                {[0, 1].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="size-8 animate-pulse rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!messagesLoading && messages.length === 0 && !streamingForThisChat && (
              <EmptyState
                userName={user?.name?.split(" ")[0] ?? undefined}
                onPick={setInput}
              />
            )}

            {messages.map((m) => (
              <MessageBubble
                key={m._id}
                message={m}
                onEdit={(id, content) => void edit(id, content)}
                onRegenerate={() => void regenerateLast()}
                onRate={rate}
                canRegenerate={m._id === lastAssistant?._id && !streamingForThisChat}
              />
            ))}

            {streamingForThisChat && (
              <div className="group flex w-full gap-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-gradient-to-br from-violet-500/30 to-cyan-400/30 text-xs font-bold">
                  N
                </div>
                <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tl-md border border-border/70 bg-card px-4 py-2.5 shadow-sm">
                  {streaming.text ? (
                    <Markdown content={streaming.text + "▍"} />
                  ) : (
                    <div className="flex items-center gap-1 py-1">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="typing-dot size-1.5 rounded-full bg-primary"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-border/70 bg-background/80 px-4 py-3 backdrop-blur">
          <div className="mx-auto max-w-3xl">
            <input
              ref={imageInputRef}
              type="file"
              multiple
              accept={IMAGE_TYPES.join(",")}
              className="hidden"
              onChange={(event) => {
                if (event.target.files?.length) void handleFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <input
              ref={documentInputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={(event) => {
                if (event.target.files?.length) void handleFiles(event.target.files);
                event.target.value = "";
              }}
            />
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex max-w-full items-center gap-2 rounded-xl border border-border/70 bg-card px-2.5 py-1.5 text-xs"
                  >
                    {attachment.kind === "image" ? (
                      <ImageIcon className="size-3.5 shrink-0 text-primary" />
                    ) : (
                      <FileText className="size-3.5 shrink-0 text-primary" />
                    )}
                    <span className="max-w-48 truncate">{attachment.name}</span>
                    <span className="text-muted-foreground">
                      {formatBytes(attachment.size)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${attachment.name}`}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setAttachments((current) =>
                          current.filter((item) => item.id !== attachment.id),
                        )
                      }
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="glass flex items-end gap-2 rounded-2xl border border-border/70 p-2 shadow-lg focus-within:ring-2 focus-within:ring-ring">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0 rounded-xl"
                    aria-label="Attach files"
                    title="Attach files"
                    disabled={pending}
                  >
                    <Plus className="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top">
                  <DropdownMenuItem
                    className="cursor-pointer gap-2"
                    onSelect={() =>
                      window.requestAnimationFrame(() =>
                        imageInputRef.current?.click(),
                      )
                    }
                  >
                    <ImageIcon className="size-4" />
                    Upload images
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer gap-2"
                    onSelect={() =>
                      window.requestAnimationFrame(() =>
                        documentInputRef.current?.click(),
                      )
                    }
                  >
                    <FileText className="size-4" />
                    Upload files
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Message Nexus…"
                className="max-h-40 min-h-[44px] flex-1 resize-none border-0 bg-transparent px-2 py-2.5 focus-visible:ring-0"
                rows={1}
                disabled={pending}
              />
              {streamingForThisChat ? (
                <Button
                  size="icon"
                  className="size-10 rounded-xl"
                  variant="secondary"
                  onClick={handleStop}
                >
                  <Square className="size-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="size-10 rounded-xl"
                  onClick={() => void handleSend()}
                  disabled={(!input.trim() && attachments.length === 0) || pending}
                >
                  <ArrowUp className="size-4" />
                </Button>
              )}
            </div>
            <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
              Attach up to 5 PDF, DOCX, TXT, MD, CSV, PNG, JPG or WebP files.
              Nexus can make mistakes — verify important information.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function getAttachmentMimeType(file: File): string {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (name.endsWith(".md")) return "text/markdown";
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  return "text/plain";
}

function readImageDataUrl(file: File, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read image"));
        return;
      }
      const dataUrl = reader.result.replace(/^data:[^;]*;/, `data:${mimeType};`);
      resolve(dataUrl);
    };
    reader.readAsDataURL(file);
  });
}

function EmptyState({
  userName,
  onPick,
}: {
  userName?: string;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-col items-center pt-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg shadow-primary/25">
        <Bot className="size-7 text-white" />
      </div>
      <h2 className="mt-4 font-display text-2xl font-bold tracking-tight">
        {userName ? `Hey ${userName}, ` : ""}what's on your mind?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ask anything, or pick a starter below.
      </p>
      <div className="mt-6 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            onClick={() => onPick(s.prompt)}
            className="group rounded-xl border border-border/70 bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{s.icon}</span>
              <span className="text-sm font-semibold">{s.title}</span>
              <Sparkles className="ml-auto size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {s.prompt}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
