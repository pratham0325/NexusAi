/** OtpCode — short-lived hashed email sign-in codes with TTL cleanup. */
import mongoose, { Schema } from "mongoose";

export interface IOtpCode {
  email: string;
  codeHash: string;
  attempts: number;
  consumedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IOtpCode>(
  {
    email: { type: String, required: true, lowercase: true, index: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpCode = mongoose.model<IOtpCode>("OtpCode", schema);
