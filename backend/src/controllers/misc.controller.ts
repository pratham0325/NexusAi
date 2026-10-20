/** Misc controllers — documents, assistants, settings, usage, admin. */
import type { Request, Response, NextFunction } from "express";
import { Assistant, type IAssistant } from "../models/Assistant.js";
import { Document } from "../models/Document.js";
import { User } from "../models/User.js";
import {
  assistantCreateSchema,
  assistantPatchSchema,
  documentIngestSchema,
  settingsPatchSchema,
} from "../validators/index.js";
import { HttpError, formatZodError } from "../utils/http-error.js";
import { env } from "../config/env.js";
import {
  canonicalModelId,
  getAvailableAiModels,
} from "../services/ai/provider.js";
import {
  ingest,
  listDocuments,
  removeDocument,
} from "../services/documents/documents.service.js";
import {
  getSettings,
  updateSettings,
} from "../services/settings/settings.service.js";
import { adminStats, usageSummary } from "../services/usage/usage.service.js";
import type { AssistantWire } from "../types/index.js";

function requireUserId(req: Request): string {
  if (!req.user) throw new HttpError(401, "UNAUTHENTICATED", "Not signed in");
  return req.user.id;
}

export function getAvailableModels(
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  res.json({ success: true, data: getAvailableAiModels() });
}

/* ─── Documents (RAG) ─────────────────────────────────────────────────── */

export async function getDocuments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json({ success: true, data: await listDocuments(requireUserId(req)) });
  } catch (err) {
    next(err);
  }
}

export async function postDocument(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = documentIngestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION", formatZodError(parsed.error));
    }
    const doc = await ingest(requireUserId(req), parsed.data);
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

export async function deleteDocument(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await removeDocument(requireUserId(req), String(req.params.id));
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}

/* ─── Assistants ──────────────────────────────────────────────────────── */

function toAssistantWire(a: IAssistant & { _id: unknown }): AssistantWire {
  return {
    _id: String(a._id),
    userId: String(a.userId),
    name: a.name,
    description: a.description,
    systemPrompt: a.systemPrompt,
    modelId: a.modelId,
    temperature: a.temperature,
    emoji: a.emoji,
    documentIds: a.documentIds.map((d) => String(d)),
    createdAt: new Date(a.createdAt).getTime(),
  };
}

export async function getAssistants(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const list = await Assistant.find({ userId: requireUserId(req) })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: list.map(toAssistantWire) });
  } catch (err) {
    next(err);
  }
}

export async function getAssistant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const a = await Assistant.findOne({
      _id: req.params.id,
      userId: requireUserId(req),
    });
    if (!a) throw new HttpError(404, "NOT_FOUND", "Assistant not found");
    res.json({
      success: true,
      data: toAssistantWire(a as IAssistant & { _id: unknown }),
    });
  } catch (err) {
    next(err);
  }
}

export async function postAssistant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = assistantCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION", formatZodError(parsed.error));
    }
    if (
      !getAvailableAiModels().modelIds.includes(
        canonicalModelId(parsed.data.modelId),
      )
    ) {
      throw new HttpError(
        400,
        "MODEL_UNAVAILABLE",
        "The selected model is not available with configured API keys",
      );
    }
    parsed.data.modelId = canonicalModelId(parsed.data.modelId);
    const userId = requireUserId(req);
    const documentIds = [...new Set(parsed.data.documentIds)];
    if (documentIds.length > 0) {
      const ownedCount = await Document.countDocuments({
        _id: { $in: documentIds },
        userId,
      });
      if (ownedCount !== documentIds.length) {
        throw new HttpError(
          404,
          "DOCUMENT_NOT_FOUND",
          "One or more documents were not found",
        );
      }
    }
    const a = await Assistant.create({ ...parsed.data, documentIds, userId });
    res
      .status(201)
      .json({
        success: true,
        data: toAssistantWire(a as IAssistant & { _id: unknown }),
      });
  } catch (err) {
    next(err);
  }
}

export async function patchAssistant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = assistantPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION", formatZodError(parsed.error));
    }
    if (
      parsed.data.modelId &&
      !getAvailableAiModels().modelIds.includes(
        canonicalModelId(parsed.data.modelId),
      )
    ) {
      throw new HttpError(
        400,
        "MODEL_UNAVAILABLE",
        "The selected model is not available with configured API keys",
      );
    }
    if (parsed.data.modelId) {
      parsed.data.modelId = canonicalModelId(parsed.data.modelId);
    }
    const userId = requireUserId(req);
    const documentIds = parsed.data.documentIds
      ? [...new Set(parsed.data.documentIds)]
      : undefined;
    if (documentIds && documentIds.length > 0) {
      const ownedCount = await Document.countDocuments({
        _id: { $in: documentIds },
        userId,
      });
      if (ownedCount !== documentIds.length) {
        throw new HttpError(
          404,
          "DOCUMENT_NOT_FOUND",
          "One or more documents were not found",
        );
      }
    }
    const a = await Assistant.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: { ...parsed.data, ...(documentIds ? { documentIds } : {}) } },
      { new: true },
    );
    if (!a) throw new HttpError(404, "NOT_FOUND", "Assistant not found");
    res.json({
      success: true,
      data: toAssistantWire(a as IAssistant & { _id: unknown }),
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteAssistant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const a = await Assistant.findOneAndDelete({
      _id: req.params.id,
      userId: requireUserId(req),
    });
    if (!a) throw new HttpError(404, "NOT_FOUND", "Assistant not found");
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}

/* ─── Settings ────────────────────────────────────────────────────────── */

export async function getMySettings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json({ success: true, data: await getSettings(requireUserId(req)) });
  } catch (err) {
    next(err);
  }
}

export async function patchMySettings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = settingsPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION", formatZodError(parsed.error));
    }
    res.json({
      success: true,
      data: await updateSettings(requireUserId(req), parsed.data),
    });
  } catch (err) {
    next(err);
  }
}

/* ─── Usage + Admin ───────────────────────────────────────────────────── */

export async function getUsage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json({ success: true, data: await usageSummary(requireUserId(req)) });
  } catch (err) {
    next(err);
  }
}

export async function getAdminStats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const user = await User.findById(userId).lean();
    if (!user || user.role !== "admin") {
      res.json({ success: true, data: null });
      return;
    }
    res.json({ success: true, data: await adminStats() });
  } catch (err) {
    next(err);
  }
}

/** First admin claim: grants admin when no admin exists yet. */
export async function postAdminClaim(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const anyAdmin = await User.findOne({ role: "admin" }).lean();
    if (anyAdmin) {
      res.json({
        success: true,
        data: { claimed: false, message: "An admin already exists" },
      });
      return;
    }
    const user = await User.findById(userId)
      .select("email emailVerified isAnonymous")
      .lean();
    const allowedEmails = env.ADMIN_EMAILS.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (
      !user?.email ||
      user.isAnonymous ||
      !allowedEmails.includes(user.email.toLowerCase())
    ) {
      throw new HttpError(
        403,
        "FORBIDDEN",
        "This account is not authorized to claim admin access",
      );
    }
    // Password sign-up does not prove address ownership; require an
    // email-code sign-in first so a squatter cannot claim an allowlisted email.
    if (!user.emailVerified) {
      throw new HttpError(
        403,
        "EMAIL_NOT_VERIFIED",
        "Sign in with an email code once to verify this address, then claim admin access",
      );
    }
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, role: { $ne: "admin" } },
      { $set: { role: "admin" } },
      { new: true },
    );
    if (!updatedUser) throw new HttpError(404, "NOT_FOUND", "User not found");
    res.json({
      success: true,
      data: { claimed: true, message: "You are now the platform admin" },
    });
  } catch (err) {
    next(err);
  }
}
