/** Chat service — assembles prompts from conversation, assistant and RAG. */
import { Assistant } from "../../models/Assistant.js";
import { Conversation } from "../../models/Conversation.js";
import { Message } from "../../models/Message.js";
import {
  canonicalModelId,
  getAvailableAiModels,
  type ChatMessage,
} from "../ai/provider.js";
import { buildRagContext, retrieve } from "../rag/rag.service.js";
import { HttpError } from "../../utils/http-error.js";

const MAX_HISTORY = 20;

export interface PromptContext {
  conversationId: string;
  userId: string;
  modelId: string;
  temperature: number;
  messages: ChatMessage[];
  documentIds: string[];
}

/** Builds the full prompt context for the next generation in a conversation. */
export async function buildPromptContext(
  conversationId: string,
  userId: string,
  fallbackModelId: string,
): Promise<PromptContext> {
  const convo = await Conversation.findOne({
    _id: conversationId,
    userId,
  });
  if (!convo) throw new HttpError(404, "NOT_FOUND", "Conversation not found");
  const availableModels = getAvailableAiModels();
  const selectedModelId = canonicalModelId(convo.modelId || fallbackModelId);
  const modelId = availableModels.modelIds.includes(selectedModelId)
    ? selectedModelId
    : availableModels.recommendedDefaultModelId;
  if (convo.modelId !== modelId) {
    convo.modelId = modelId;
    await convo.save();
  }

  const history = await Message.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(MAX_HISTORY)
    .lean();
  history.reverse();
  const imageContentSize = history.reduce(
    (size, message) =>
      size +
      (message.attachments ?? [])
        .filter((attachment) => attachment.kind === "image")
        .reduce(
          (attachmentSize, attachment) =>
            attachmentSize + attachment.content.length,
          0,
        ),
    0,
  );
  if (imageContentSize > 10_000_000) {
    throw new HttpError(
      413,
      "TOO_MANY_IMAGES",
      "This conversation has too many image attachments for one request. Start a new chat or remove some images.",
    );
  }

  const systemParts: string[] = [
    "You are Nexus, an intelligent AI workspace assistant. Be helpful, precise and well-formatted (Markdown).",
  ];

  let documentIds: string[] = [];
  let temperature = 0.7;

  if (convo.assistantId) {
    const assistant = await Assistant.findOne({
      _id: convo.assistantId,
      userId,
    }).lean();
    if (!assistant) throw new HttpError(404, "ASSISTANT_NOT_FOUND", "Assistant not found");
    if (assistant.systemPrompt) systemParts.push(assistant.systemPrompt);
    temperature = assistant.temperature ?? temperature;
    documentIds = assistant.documentIds.map((d) => String(d));
  }

  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const lastUserText = lastUser
    ? [
        lastUser.content,
        ...(lastUser.attachments ?? [])
          .filter((attachment) => attachment.kind === "text")
          .map(
            (attachment) =>
              `[Attached file: ${attachment.name}]\n${attachment.content}`,
          ),
      ].join("\n\n")
    : "";
  const sources = lastUser
    ? await retrieve(userId, documentIds, lastUserText)
    : [];
  const ragContext = buildRagContext(sources);
  if (ragContext) systemParts.push(ragContext);

  const messages: ChatMessage[] = [
    { role: "system", content: systemParts.join("\n\n") },
    ...history
      .filter((m) => m.content.trim().length > 0)
      .map((m) => {
        const attachments = m.attachments ?? [];
        const textContent = [
          m.content,
          ...attachments
            .filter((attachment) => attachment.kind === "text")
            .map(
              (attachment) =>
                `[Attached file: ${attachment.name}]\n${attachment.content}`,
            ),
        ]
          .filter(Boolean)
          .join("\n\n");
        const imageParts = attachments
          .filter((attachment) => attachment.kind === "image")
          .map((attachment) => ({
            type: "image_url" as const,
            image_url: { url: attachment.content },
          }));

        return {
          role: m.role,
          content:
            imageParts.length > 0
              ? [
                  {
                    type: "text" as const,
                    text: textContent || "Please analyze the attached image.",
                  },
                  ...imageParts,
                ]
              : textContent,
        };
      }),
  ];

  return {
    conversationId,
    userId,
    modelId,
    temperature,
    messages,
    documentIds,
  };
}

export { retrieve };
