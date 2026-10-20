/** Conversation — chat thread owned by a user. */
import mongoose, { Schema } from "mongoose";

export interface IConversation {
  userId: mongoose.Types.ObjectId;
  title: string;
  modelId: string;
  assistantId: mongoose.Types.ObjectId | null;
  pinned: boolean;
  archived: boolean;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IConversation>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, default: "New chat" },
    modelId: { type: String, default: "qwen/qwen3.8-27b" },
    assistantId: {
      type: Schema.Types.ObjectId,
      ref: "Assistant",
      default: null,
    },
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    lastMessageAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

schema.index({ userId: 1, lastMessageAt: -1 });

export const Conversation = mongoose.model<IConversation>(
  "Conversation",
  schema,
);
