/** Settings service — per-user preference get/update. */
import { UserSettings, type IUserSettings } from "../../models/UserSettings.js";
import type { UserSettingsWire } from "../../types/index.js";
import { canonicalModelId, getAvailableAiModels } from "../ai/provider.js";
import { HttpError } from "../../utils/http-error.js";

type SettingsDoc = IUserSettings & { _id: { toString(): string } };

export function toSettingsWire(s: SettingsDoc): UserSettingsWire {
  const availableModels = getAvailableAiModels();
  const savedModel = canonicalModelId(s.defaultModelId);
  const defaultModelId =
    s.defaultModelId !== "gemini-3.6-flash" &&
    availableModels.modelIds.includes(savedModel)
      ? savedModel
      : availableModels.recommendedDefaultModelId;
  return {
    _id: String(s._id),
    userId: String(s.userId),
    theme: s.theme,
    defaultModelId,
    temperature: s.temperature,
    streamingEnabled: s.streamingEnabled,
    emailUpdates: s.emailUpdates,
  };
}

export async function getSettings(userId: string): Promise<UserSettingsWire> {
  let s = await UserSettings.findOne({ userId }).lean();
  if (!s) {
    await UserSettings.create({ userId } as never);
    s = await UserSettings.findOne({ userId }).lean();
  }
  if (!s) throw new Error("Failed to create settings");
  return toSettingsWire(s as SettingsDoc);
}

export async function updateSettings(
  userId: string,
  patch: Partial<Omit<UserSettingsWire, "_id" | "userId">>,
): Promise<UserSettingsWire> {
  await getSettings(userId);
  if (patch.defaultModelId) {
    const availableModels = getAvailableAiModels();
    const modelId = canonicalModelId(patch.defaultModelId);
    if (!availableModels.modelIds.includes(modelId)) {
      throw new HttpError(
        400,
        "MODEL_UNAVAILABLE",
        "The selected model is not available with configured API keys",
      );
    }
    patch = { ...patch, defaultModelId: modelId };
  }
  const s = await UserSettings.findOneAndUpdate(
    { userId },
    { $set: patch },
    { new: true },
  ).lean();
  if (!s) throw new Error("Settings not found");
  return toSettingsWire(s as SettingsDoc);
}
