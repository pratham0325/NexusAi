/** Shared Mongoose helpers. */
import type { Document } from "mongoose";

export type Doc<T> = Document<unknown, Record<string, never>, T>;

/** Serializes a mongoose doc to its plain wire shape (string _id, no __v). */
export function toWire<T extends { _id: unknown }>(
  doc: T & { __v?: number; toObject?: () => Record<string, unknown> },
): T & { _id: string } {
  const obj =
    typeof doc.toObject === "function"
      ? (doc.toObject() as Record<string, unknown>)
      : ({ ...doc } as Record<string, unknown>);
  delete obj.__v;
  return { ...(obj as T), _id: String(doc._id) };
}

/** Converts an ObjectId (or unknown) to a string id. */
export function oid(value: unknown): string {
  return String(value);
}
