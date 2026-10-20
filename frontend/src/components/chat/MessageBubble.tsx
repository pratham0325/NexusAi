import { Markdown } from "@/components/chat/Markdown";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { modelLabel } from "@/lib/models";
import type { Message } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  Check,
  Copy,
  FileText,
  Image as ImageIcon,
  Pencil,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";

interface MessageBubbleProps {
  message: Message;
  onEdit: (messageId: Message["_id"], content: string) => void;
  onRegenerate: (messageId: Message["_id"]) => void;
  onRate: (messageId: Message["_id"], rating: "up" | "down" | undefined) => void;
  canRegenerate: boolean;
}

export function MessageBubble({
  message,
  onEdit,
  onRegenerate,
  onRate,
  canRegenerate,
}: MessageBubbleProps) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const isUser = message.role === "user";

  const copy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  const submitEdit = () => {
    if (draft.trim() && draft !== message.content) {
      onEdit(message._id, draft);
    }
    setEditing(false);
  };

  return (
    <div
      className={cn(
        "group flex w-full gap-3",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <Avatar className="mt-0.5 size-8 shrink-0 border border-border/60">
        <AvatarFallback
          className={cn(
            "text-xs font-semibold",
            isUser
              ? "bg-primary/15 text-primary"
              : "bg-gradient-to-br from-violet-500/30 to-cyan-400/30 text-foreground",
          )}
        >
          {isUser
            ? (user?.name?.[0] ?? user?.email?.[0] ?? "U").toUpperCase()
            : "N"}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "flex min-w-0 max-w-[85%] flex-col gap-1",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 shadow-sm",
            isUser
              ? "rounded-tr-md bg-primary text-primary-foreground"
              : "rounded-tl-md border border-border/70 bg-card",
          )}
        >
          {editing ? (
            <div className="w-full min-w-[260px] space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-[80px] text-sm"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(message.content);
                    setEditing(false);
                  }}
                >
                  <X className="size-3.5" />
                  Cancel
                </Button>
                <Button size="sm" onClick={submitEdit}>
                  <Check className="size-3.5" />
                  Save & resend
                </Button>
              </div>
            </div>
          ) : isUser ? (
            <div className="space-y-2">
              {message.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {message.attachments.map((attachment, index) => (
                    <span
                      key={`${attachment.name}-${index}`}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-primary-foreground/15 px-2 py-1 text-xs"
                    >
                      {attachment.kind === "image" ? (
                        <ImageIcon className="size-3.5 shrink-0" />
                      ) : (
                        <FileText className="size-3.5 shrink-0" />
                      )}
                      <span className="truncate">{attachment.name}</span>
                    </span>
                  ))}
                </div>
              )}
              {message.content && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {message.content}
                </p>
              )}
            </div>
          ) : (
            <Markdown content={message.content} />
          )}
        </div>

        {!editing && (
          <div
            className={cn(
              "flex items-center gap-1",
              isUser && "flex-row-reverse",
            )}
          >
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-md text-muted-foreground"
              onClick={copy}
            >
              {copied ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </Button>
            {isUser && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 rounded-md text-muted-foreground"
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
            {!isUser && canRegenerate && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 rounded-md text-muted-foreground"
                onClick={() => onRegenerate(message._id)}
              >
                <RefreshCw className="size-3.5" />
              </Button>
            )}
            {!isUser && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "size-7 rounded-md",
                    message.rating === "up"
                      ? "text-emerald-500"
                      : "text-muted-foreground",
                  )}
                  onClick={() =>
                    onRate(message._id, message.rating === "up" ? undefined : "up")
                  }
                >
                  <ThumbsUp className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "size-7 rounded-md",
                    message.rating === "down"
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                  onClick={() =>
                    onRate(
                      message._id,
                      message.rating === "down" ? undefined : "down",
                    )
                  }
                >
                  <ThumbsDown className="size-3.5" />
                </Button>
              </>
            )}
            {!isUser && message.modelId && (
              <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                {modelLabel(message.modelId)}
              </span>
            )}
            {message.editedAt && (
              <span className="ml-1 text-[10px] text-muted-foreground/70">
                edited
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
