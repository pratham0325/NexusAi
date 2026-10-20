/** UserSettings — per-user preferences (theme, default model, temperature…). */
import mongoose, { Schema } from "mongoose";

export interface IUserSettings {
  userId: mongoose.Types.ObjectId;
  theme: "light" | "dark" | "system";
  defaultModelId: string;
  temperature: number;
  streamingEnabled: boolean;
  emailUpdates: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IUserSettings>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      unique: true,
    },
    theme: {
      type: String,
      enum: ["light", "dark", "system"],
      default: "system",
    },
    defaultModelId: { type: String, default: "qwen/qwen3.8-27b" },
    temperature: { type: Number, default: 0.7 },
    streamingEnabled: { type: Boolean, default: true },
    emailUpdates: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const UserSettings = mongoose.model<IUserSettings>(
  "UserSettings",
  schema,
);
