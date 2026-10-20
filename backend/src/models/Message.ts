/** Message — a single chat message within a conversation. */
import mongoose, { Schema } from "mongoose";

export interface IMessage {
  conversationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: "user" | "assistant";
  content: string;
  attachments: {
    name: string;
    mimeType: string;
    kind: "image" | "text";
    content: string;
  }[];
  modelId: string | null;
  rating: "up" | "down" | null;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    attachments: {
      type: [
        new Schema(
          {
            name: { type: String, required: true },
            mimeType: { type: String, required: true },
            kind: { type: String, enum: ["image", "text"], required: true },
            content: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    modelId: { type: String, default: null },
    rating: { type: String, enum: ["up", "down", null], default: null },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

schema.index({ conversationId: 1, createdAt: 1 });

export const Message = mongoose.model<IMessage>("Message", schema);
