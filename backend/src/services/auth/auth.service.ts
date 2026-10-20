/**
 * Auth service — register, login, email-OTP sign-in, guest sessions.
 * OTP codes are delivered via Resend when RESEND_API_KEY is set, otherwise
 * logged to console and (in development) returned as devOtp so the sign-in
 * flow works without an email provider.
 */
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type { Request, Response } from "express";
import { env, isProd } from "../../config/env.js";
import { OtpCode } from "../../models/OtpCode.js";
import { User } from "../../models/User.js";
import { UserSettings } from "../../models/UserSettings.js";
import type { UserWire } from "../../types/index.js";
import { HttpError } from "../../utils/http-error.js";
import {
  clearSessionCookies,
  issueSession,
  revokeSession,
  type IssuedSession,
} from "./session.js";

/** bcrypt work factor for new hashes; existing cost-10 hashes still verify. */
const BCRYPT_ROUNDS = 12;
const OTP_MAX_ATTEMPTS = 5;
const OTP_WINDOW_MS = 10 * 60 * 1000;
const OTP_MAX_REQUESTS_PER_WINDOW = 3;
/** Compared against when the account does not exist, to equalize timing. */
const DUMMY_HASH = bcrypt.hashSync("nexusai-timing-equalizer", BCRYPT_ROUNDS);

export function toUserWire(user: {
  _id: unknown;
  name: string | null;
  email: string | null;
  role: string;
  isAnonymous: boolean;
}): UserWire {
  return {
    _id: String(user._id),
    name: user.name,
    email: user.email ?? null,
    role: (user.role as UserWire["role"]) ?? "user",
    isAnonymous: user.isAnonymous,
  };
}

async function ensureSettings(userId: string): Promise<void> {
  const existing = await UserSettings.findOne({ userId }).lean();
  if (!existing) {
    await UserSettings.create({ userId } as never);
  }
}

export type AuthSessionResult = {
  user: UserWire;
  isNewUser: boolean;
  /** Bearer fallback for cross-site contexts where cookies are blocked. */
  accessToken: string;
};

export async function register(
  res: Response,
  input: { name: string; email: string; password: string },
): Promise<AuthSessionResult> {
  const email = input.email.toLowerCase();
  const existing = await User.findOne({ email }).lean();
  if (existing) {
    throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists");
  }
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await User.create({
    name: input.name,
    email,
    passwordHash,
    role: "user",
    isAnonymous: false,
  });
  await ensureSettings(String(user._id));
  const issued: IssuedSession = await issueSession(res, user);
  return { user: toUserWire(user), isNewUser: true, accessToken: issued.accessToken };
}

export async function login(
  res: Response,
  input: { email: string; password: string },
): Promise<AuthSessionResult> {
  const email = input.email.toLowerCase();
  const user = await User.findOne({ email });
  // Always run one bcrypt comparison so response time does not reveal
  // whether the account exists.
  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user?.passwordHash || !ok) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }
  const issued = await issueSession(res, user);
  return { user: toUserWire(user), isNewUser: false, accessToken: issued.accessToken };
}

/** Issues a 6-digit code, stores its hash, and emails it when possible. */
export async function requestOtp(
  email: string,
): Promise<{ sent: boolean; devOtp?: string | null }> {
  const normalized = email.toLowerCase();
  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Per-address cap (the IP rate limiter alone does not stop a distributed
  // brute force that keeps requesting fresh codes).
  const recent = await OtpCode.countDocuments({
    email: normalized,
    createdAt: { $gt: new Date(Date.now() - OTP_WINDOW_MS) },
  });
  if (recent >= OTP_MAX_REQUESTS_PER_WINDOW) {
    throw new HttpError(
      429,
      "OTP_RATE_LIMITED",
      "Too many codes requested — try again in a few minutes",
    );
  }
  // Older unused codes stop working once a new one is issued.
  await OtpCode.updateMany(
    { email: normalized, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  await OtpCode.create({ email: normalized, codeHash, expiresAt });

  if (env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.OTP_FROM_EMAIL,
          to: normalized,
          subject: "Your NexusAI sign-in code",
          html: `<p>Your NexusAI sign-in code is:</p><h2 style="letter-spacing:6px">${code}</h2><p>It expires in 10 minutes.</p>`,
        }),
      });
      if (!res.ok) throw new Error(`Resend responded ${res.status}`);
      return { sent: true, devOtp: null };
    } catch (err) {
      console.error(
        "OTP email failed:",
        err instanceof Error ? err.message : "unknown error",
      );
      // fall through to dev fallback
    }
  }

  if (!isProd && env.DEV_OTP) {
    console.log(`\n🔐 OTP for ${normalized}: ${code}\n`);
    return { sent: false, devOtp: code };
  }
  return { sent: false, devOtp: null };
}

export async function verifyOtp(
  res: Response,
  email: string,
  code: string,
): Promise<AuthSessionResult & { devOtp?: string | null }> {
  const normalized = email.toLowerCase();
  // Reserve an attempt atomically before comparing, so parallel guesses
  // cannot exceed the attempt limit.
  const record = await OtpCode.findOneAndUpdate(
    {
      email: normalized,
      consumedAt: null,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: OTP_MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },
    { sort: { createdAt: -1 }, new: true },
  );
  if (!record) {
    throw new HttpError(
      400,
      "OTP_INVALID",
      "Code expired, used or locked — request a new one",
    );
  }
  const ok = await bcrypt.compare(code, record.codeHash);
  if (!ok) {
    throw new HttpError(400, "OTP_INVALID", "Incorrect code");
  }
  // Single use: only the first successful verification consumes the code.
  const consumed = await OtpCode.updateOne(
    { _id: record._id, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  if (consumed.modifiedCount !== 1) {
    throw new HttpError(400, "OTP_INVALID", "Code already used");
  }

  let user = await User.findOne({ email: normalized });
  let isNewUser = false;
  if (!user) {
    user = await User.create({
      name: null,
      email: normalized,
      passwordHash: null,
      role: "user",
      isAnonymous: false,
      emailVerified: true,
    });
    isNewUser = true;
  } else if (!user.emailVerified) {
    user.emailVerified = true;
    await user.save();
  }
  await ensureSettings(String(user._id));
  const issued = await issueSession(res, user);
  return { user: toUserWire(user), isNewUser, accessToken: issued.accessToken };
}

export async function createGuest(
  res: Response,
): Promise<AuthSessionResult> {
  const suffix = crypto.randomBytes(3).toString("hex");
  const user = await User.create({
    name: `Guest ${suffix}`,
    passwordHash: null,
    role: "user",
    isAnonymous: true,
  });
  await ensureSettings(String(user._id));
  const issued = await issueSession(res, user);
  return { user: toUserWire(user), isNewUser: true, accessToken: issued.accessToken };
}

export async function signOut(req: Request, res: Response): Promise<void> {
  await revokeSession(req);
  clearSessionCookies(res);
}
