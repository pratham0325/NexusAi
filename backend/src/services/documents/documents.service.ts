/** Documents service — list / ingest / remove with ownership enforcement. */
import { HttpError } from "../../utils/http-error.js";
import type { DocumentWire, UserWire } from "../../types/index.js";
import { Document, type IDocument } from "../../models/Document.js";
import { ingestDocument, deleteDocumentData } from "../rag/rag.service.js";

export function toDocumentWire(d: IDocument & { _id: unknown }): DocumentWire {
  return {
    _id: String(d._id),
    userId: String(d.userId),
    name: d.name,
    mimeType: d.mimeType,
    size: d.size,
    status: d.status,
    error: d.error,
    chunkCount: d.chunkCount,
    charCount: d.charCount,
    createdAt: new Date(d.createdAt).getTime(),
  };
}

export async function listDocuments(userId: string): Promise<DocumentWire[]> {
  const docs = await Document.find({ userId }).sort({ createdAt: -1 }).lean();
  return docs.map(toDocumentWire);
}

export async function ingest(
  userId: string,
  input: { name: string; mimeType: string; size: number; text: string },
): Promise<DocumentWire> {
  const doc = await Document.create({
    userId,
    name: input.name,
    mimeType: input.mimeType,
    size: input.size,
    status: "processing",
  });
  try {
    await ingestDocument(doc, input.text);
  } catch (err) {
    await Document.updateOne(
      { _id: doc._id },
      {
        $set: {
          status: "failed",
          error: err instanceof Error ? err.message : "Ingestion failed",
        },
      },
    );
  }
  const fresh = await Document.findById(doc._id);
  if (!fresh) throw new HttpError(500, "INTERNAL", "Document disappeared");
  return toDocumentWire(fresh);
}

export async function removeDocument(
  userId: string,
  documentId: string,
): Promise<boolean> {
  const doc = await Document.findOne({ _id: documentId, userId });
  if (!doc) throw new HttpError(404, "NOT_FOUND", "Document not found");
  await deleteDocumentData(documentId);
  return true;
}

export type { UserWire };
