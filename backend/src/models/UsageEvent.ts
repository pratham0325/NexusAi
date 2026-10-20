/** UsageEvent — one event per AI generation for analytics. */
import mongoose, { Schema } from "mongoose";

export interface IUsageEvent {
  userId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId | null;
  messageId: mongoose.Types.ObjectId | null;
  modelId: string;
  promptChars: number;
  completionChars: number;
  source: "chat" | "assistant";
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IUsageEvent>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", default: null },
    messageId: { type: Schema.Types.ObjectId, ref: "Message", default: null },
    modelId: { type: String, required: true },
    promptChars: { type: Number, default: 0 },
    completionChars: { type: Number, default: 0 },
    source: { type: String, enum: ["chat", "assistant"], default: "chat" },
  },
  { timestamps: true },
);

schema.index({ userId: 1, createdAt: -1 });

export const UsageEvent = mongoose.model<IUsageEvent>("UsageEvent", schema);
