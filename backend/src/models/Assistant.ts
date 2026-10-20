/** Assistant — custom AI assistant with system prompt + knowledge base. */
import mongoose, { Schema } from "mongoose";

export interface IAssistant {
  userId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  systemPrompt: string;
  modelId: string;
  temperature: number;
  emoji: string;
  documentIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IAssistant>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    systemPrompt: { type: String, default: "" },
    modelId: { type: String, default: "qwen/qwen3.8-27b" },
    temperature: { type: Number, default: 0.7 },
    emoji: { type: String, default: "🤖" },
    documentIds: [{ type: Schema.Types.ObjectId, ref: "Document" }],
  },
  { timestamps: true },
);

export const Assistant = mongoose.model<IAssistant>("Assistant", schema);
