/** Conversations controller — CRUD, messages, edit, rate, regenerate. */
import type { Request, Response, NextFunction } from "express";
import type { HydratedDocument } from "mongoose";
import { Conversation, type IConversation } from "../models/Conversation.js";
import { Message, type IMessage } from "../models/Message.js";
import { Assistant } from "../models/Assistant.js";
import {
  conversationCreateSchema,
  conversationPatchSchema,
  messageAppendSchema,
  messageEditSchema,
  ratingSchema,
} from "../validators/index.js";
import { HttpError, formatZodError } from "../utils/http-error.js";
import { env } from "../config/env.js";
import {
  canonicalModelId,
  getAvailableAiModels,
} from "../services/ai/provider.js";
import { getSettings } from "../services/settings/settings.service.js";

export function toConversationWire(
  c: IConversation & { _id: unknown },
): Record<string, unknown> {
  return {
    _id: String(c._id),
    userId: String(c.userId),
    title: c.title,
    modelId: c.modelId,
    assistantId: c.assistantId ? String(c.assistantId) : null,
    pinned: c.pinned,
    archived: c.archived,
    lastMessageAt: new Date(c.lastMessageAt).getTime(),
    createdAt: new Date(c.createdAt).getTime(),
  };
}

export function toMessageWire(
  m: IMessage & { _id: unknown },
): Record<string, unknown> {
  return {
    _id: String(m._id),
    conversationId: String(m.conversationId),
    userId: String(m.userId),
    role: m.role,
    content: m.content,
    attachments: (m.attachments ?? []).map(({ name, mimeType, kind }) => ({
      name,
      mimeType,
      kind,
    })),
    modelId: m.modelId,
    rating: m.rating,
    editedAt: m.editedAt ? new Date(m.editedAt).getTime() : null,
    createdAt: new Date(m.createdAt).getTime(),
  };
}

async function getOwnedConversation(
  req: Request,
): Promise<HydratedDocument<IConversation>> {
  if (!req.user) throw new HttpError(401, "UNAUTHENTICATED", "Not signed in");
  const convo = await Conversation.findOne({
    _id: req.params.id,
    userId: req.user.id,
  });
  if (!convo) throw new HttpError(404, "NOT_FOUND", "Conversation not found");
  return convo as HydratedDocument<IConversation>;
}

export async function listConversations(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED", "Not signed in");
    const convos = await Conversation.find({
      userId: req.user.id,
      archived: false,
    })
      .sort({ pinned: -1, lastMessageAt: -1 })
      .limit(200)
      .lean();
    res.json({ success: true, data: convos.map(toConversationWire) });
  } catch (err) {
    next(err);
  }
}

export async function searchConversations(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED", "Not signed in");
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 200) : "";
    if (!q) {
      res.json({ success: true, data: [] });
      return;
    }
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    // Search titles, plus content via messages.
    const titleMatches = await Conversation.find({
      userId: req.user.id,
      title: regex,
    })
      .limit(50)
      .lean();
    const msgMatches = await Message.find({
      userId: req.user.id,
      content: regex,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("conversationId")
      .lean();
    const convoIds = new Set(titleMatches.map((c) => String(c._id)));
    const extraIds = msgMatches
      .map((m) => String(m.conversationId))
      .filter((id) => !convoIds.has(id));
    const extras = extraIds.length
      ? await Conversation.find({ _id: { $in: extraIds }, userId: req.user.id })
          .limit(50)
          .lean()
      : [];
    res.json({
      success: true,
      data: [...titleMatches, ...extras].map(toConversationWire),
    });
  } catch (err) {
    next(err);
  }
}

export async function getConversation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const convo = await getOwnedConversation(req);
    res.json({ success: true, data: toConversationWire(convo) });
  } catch (err) {
    next(err);
  }
}

export async function createConversation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED", "Not signed in");
    const parsed = conversationCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION", formatZodError(parsed.error));
    }
    const assistant = parsed.data.assistantId
      ? await Assistant.findOne({
          _id: parsed.data.assistantId,
          userId: req.user.id,
        })
          .select("modelId")
          .lean()
      : null;
    if (parsed.data.assistantId && !assistant) {
      throw new HttpError(404, "ASSISTANT_NOT_FOUND", "Assistant not found");
    }
    const { modelIds, recommendedDefaultModelId } = getAvailableAiModels();
    const savedDefaultModelId = parsed.data.modelId
      ? undefined
      : assistant?.modelId === "gemini-3.6-flash"
        ? recommendedDefaultModelId
        : (assistant?.modelId ??
          (await getSettings(req.user.id)).defaultModelId);
    const requestedModelId = parsed.data.modelId ?? savedDefaultModelId;
    const modelId = canonicalModelId(requestedModelId ?? env.DEFAULT_AI_MODEL);
    if (parsed.data.modelId && !modelIds.includes(modelId)) {
      throw new HttpError(
        400,
        "MODEL_UNAVAILABLE",
        "The selected model is not available with configured API keys",
      );
    }
    const convo = await Conversation.create({
      userId: req.user.id,
      title: parsed.data.title ?? "New chat",
      modelId: modelIds.includes(modelId) ? modelId : recommendedDefaultModelId,
      assistantId: parsed.data.assistantId ?? null,
    });
    res.status(201).json({ success: true, data: toConversationWire(convo) });
  } catch (err) {
    next(err);
  }
}

export async function patchConversation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const convo = await getOwnedConversation(req);
    const parsed = conversationPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION", formatZodError(parsed.error));
    }
    if (parsed.data.modelId) {
      const modelId = canonicalModelId(parsed.data.modelId);
      if (!getAvailableAiModels().modelIds.includes(modelId)) {
        throw new HttpError(
          400,
          "MODEL_UNAVAILABLE",
          "The selected model is not available with configured API keys",
        );
      }
      parsed.data.modelId = modelId;
    }
    Object.assign(convo, parsed.data);
    await convo.save();
    res.json({ success: true, data: toConversationWire(convo) });
  } catch (err) {
    next(err);
  }
}

export async function deleteConversation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const convo = await getOwnedConversation(req);
    await Message.deleteMany({ conversationId: convo._id });
    await Conversation.deleteOne({ _id: convo._id });
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}

export async function listMessages(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const convo = await getOwnedConversation(req);
    const msgs = await Message.find({ conversationId: convo._id })
      .sort({ createdAt: 1 })
      .limit(500)
      .select("-attachments.content")
      .lean();
    res.json({ success: true, data: msgs.map(toMessageWire) });
  } catch (err) {
    next(err);
  }
}

export async function appendMessage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const convo = await getOwnedConversation(req);
    const parsed = messageAppendSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION", formatZodError(parsed.error));
    }
    const msg = await Message.create({
      conversationId: convo._id,
      userId: convo.userId,
      role: "user",
      content: parsed.data.content,
      attachments: parsed.data.attachments,
    });
    // Auto-title from the first user message.
    if (convo.title === "New chat") {
      const title =
        parsed.data.content ||
        parsed.data.attachments.map((attachment) => attachment.name).join(", ");
      convo.title = title.slice(0, 60).trim() || "New chat";
    }
    convo.lastMessageAt = new Date();
    await convo.save();
    res
      .status(201)
      .json({
        success: true,
        data: toMessageWire(msg as IMessage & { _id: unknown }),
      });
  } catch (err) {
    next(err);
  }
}

export async function editMessage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED", "Not signed in");
    const parsed = messageEditSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION", formatZodError(parsed.error));
    }
    const msg = await Message.findOne({
      _id: req.params.messageId,
      userId: req.user.id,
    });
    if (!msg) throw new HttpError(404, "NOT_FOUND", "Message not found");
    msg.content = parsed.data.content;
    msg.editedAt = new Date();
    await msg.save();
    // Editing truncates everything after this message.
    await Message.deleteMany({
      conversationId: msg.conversationId,
      createdAt: { $gt: msg.createdAt },
    });
    res.json({
      success: true,
      data: toMessageWire(msg as IMessage & { _id: unknown }),
    });
  } catch (err) {
    next(err);
  }
}

export async function rateMessage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED", "Not signed in");
    const parsed = ratingSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION", formatZodError(parsed.error));
    }
    const msg = await Message.findOne({
      _id: req.params.messageId,
      userId: req.user.id,
    });
    if (!msg) throw new HttpError(404, "NOT_FOUND", "Message not found");
    msg.rating = parsed.data.rating;
    await msg.save();
    res.json({
      success: true,
      data: toMessageWire(msg as IMessage & { _id: unknown }),
    });
  } catch (err) {
    next(err);
  }
}

export async function regenerate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const convo = await getOwnedConversation(req);
    const lastUserMessage = await Message.findOne({
      conversationId: convo._id,
      role: "user",
    })
      .sort({ createdAt: -1 })
      .select("createdAt")
      .lean();
    if (lastUserMessage) {
      await Message.deleteMany({
        conversationId: convo._id,
        role: "assistant",
        createdAt: { $gt: lastUserMessage.createdAt },
      });
    }
    convo.lastMessageAt = new Date();
    await convo.save();
    res.json({ success: true, data: { ok: true } });
  } catch (err) {
    next(err);
  }
}

export async function exportConversation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const convo = await getOwnedConversation(req);
    const msgs = await Message.find({ conversationId: convo._id })
      .sort({ createdAt: 1 })
      .select("-attachments.content")
      .lean();
    res.json({
      success: true,
      data: {
        conversation: toConversationWire(convo),
        messages: msgs.map(toMessageWire),
      },
    });
  } catch (err) {
    next(err);
  }
}
