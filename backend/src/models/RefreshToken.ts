/** RefreshToken — hashed rotating refresh tokens with TTL cleanup. */
import mongoose, { Schema } from "mongoose";

export interface IRefreshToken {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  /** All tokens rotated from one sign-in share a family; reuse revokes it. */
  familyId: string | null;
  revokedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IRefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, index: true },
    familyId: { type: String, default: null, index: true },
    revokedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model<IRefreshToken>(
  "RefreshToken",
  schema,
);
