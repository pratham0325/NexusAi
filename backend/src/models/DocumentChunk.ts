/** DocumentChunk — embedded chunk of a document for vector retrieval (RAG). */
import mongoose, { Schema } from "mongoose";

export interface IDocumentChunk {
  documentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  chunkIndex: number;
  text: string;
  embedding: number[];
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IDocumentChunk>(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], default: undefined },
  },
  { timestamps: true },
);

schema.index({ userId: 1, documentId: 1, chunkIndex: 1 });

export const DocumentChunk = mongoose.model<IDocumentChunk>(
  "DocumentChunk",
  schema,
);
