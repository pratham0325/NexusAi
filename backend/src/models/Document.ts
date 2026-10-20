/** Document — an uploaded knowledge file (text extracted client-side). */
import mongoose, { Schema } from "mongoose";

export interface IDocument {
  userId: mongoose.Types.ObjectId;
  name: string;
  mimeType: string;
  size: number;
  status: "processing" | "ready" | "failed";
  error: string | null;
  chunkCount: number;
  charCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    mimeType: { type: String, default: "text/plain" },
    size: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["processing", "ready", "failed"],
      default: "processing",
    },
    error: { type: String, default: null },
    chunkCount: { type: Number, default: 0 },
    charCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Document = mongoose.model<IDocument>("Document", schema);
