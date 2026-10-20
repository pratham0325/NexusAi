/** User model — password accounts, OTP accounts and anonymous guests. */
import mongoose, { Schema } from "mongoose";

export interface IUser {
  name: string | null;
  email: string | null;
  passwordHash: string | null;
  role: "admin" | "user" | "member";
  isAnonymous: boolean;
  /** True once the user proved control of the address (email OTP). */
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IUser>(
  {
    name: { type: String, default: null },
    email: {
      type: String,
      default: undefined,
      index: { unique: true, sparse: true },
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, default: null },
    role: { type: String, enum: ["admin", "user", "member"], default: "user" },
    isAnonymous: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const User = mongoose.model<IUser>("User", schema);
