/**
 * Session service — issues JWT access tokens (short) and refresh tokens
 * (long, httpOnly cookie, rotated on use, hashed at rest). Presenting an
 * already-rotated refresh token revokes every token in its family.
 */
import crypto from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import type { Types } from "mongoose";
import { env, isProd } from "../../config/env.js";
import { RefreshToken } from "../../models/RefreshToken.js";
import { User } from "../../models/User.js";
import type { IUser } from "../../models/User.js";
import { signAccessToken } from "../../middleware/auth.js";
import { HttpError } from "../../utils/http-error.js";
import { logger } from "../../utils/logger.js";

const ACCESS_COOKIE = "accessToken";
const REFRESH_COOKIE = "refreshToken";
/** Concurrent refreshes (e.g. two tabs) may legitimately replay a token. */
const REUSE_GRACE_MS = 10_000;

function cookieBase(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: env.COOKIE_SAMESITE,
    // Browsers reject SameSite=None without Secure.
    secure: isProd || env.COOKIE_SAMESITE === "none",
    path: "/",
  };
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export interface IssuedSession {
  user: IUser & { _id: unknown };
  /** Short-lived JWT for Bearer fallback (cross-site cookie blockers). */
  accessToken: string;
}

/** Issues cookies + returns the access token for the response body. */
export async function issueSession(
  res: Response,
  user: IUser & { _id: unknown },
  familyId: string = crypto.randomUUID(),
): Promise<IssuedSession> {
  const access = signAccessToken({ sub: String(user._id), role: user.role });

  const refreshRaw = crypto.randomBytes(48).toString("hex");
  const refreshMaxAge = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

  await RefreshToken.create({
    userId: user._id as Types.ObjectId,
    tokenHash: hashToken(refreshRaw),
    familyId,
    expiresAt: new Date(Date.now() + refreshMaxAge),
  });

  res.cookie(ACCESS_COOKIE, access, {
    ...cookieBase(),
    maxAge: env.ACCESS_TOKEN_TTL_MINUTES * 60 * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshRaw, { ...cookieBase(), maxAge: refreshMaxAge });
  return { user, accessToken: access };
}

function readRefreshCookie(req: Request): string | null {
  const raw = req.cookies?.[REFRESH_COOKIE];
  return typeof raw === "string" && /^[a-f0-9]{96}$/.test(raw) ? raw : null;
}

/** Verifies the refresh cookie and rotates it, returning the user id. */
export async function rotateRefreshToken(
  req: Request,
  res: Response,
): Promise<{ userId: string; accessToken: string }> {
  const raw = readRefreshCookie(req);
  if (!raw) throw new HttpError(401, "NO_SESSION", "No refresh token");

  const tokenHash = hashToken(raw);
  const record = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date() } },
    { new: false },
  ).lean();

  if (!record) {
    const stale = await RefreshToken.findOne({ tokenHash }).lean();
    if (
      stale?.revokedAt &&
      Date.now() - new Date(stale.revokedAt).getTime() > REUSE_GRACE_MS
    ) {
      // A rotated token came back: assume theft and end the whole session.
      const family = stale.familyId ?? String(stale._id);
      await RefreshToken.updateMany(
        { $or: [{ familyId: family }, { _id: stale._id }], revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
      logger.warn("[auth] refresh token reuse detected; session revoked", {
        userId: String(stale.userId),
      });
    }
    clearSessionCookies(res);
    throw new HttpError(401, "NO_SESSION", "Invalid or expired refresh token");
  }

  const user = await User.findById(record.userId);
  if (!user) throw new HttpError(401, "NO_SESSION", "User not found");

  const issued = await issueSession(
    res,
    user,
    record.familyId ?? String(record._id),
  );
  return { userId: String(user._id), accessToken: issued.accessToken };
}

/** Revokes the presented refresh token's whole family (this sign-in). */
export async function revokeSession(req: Request): Promise<void> {
  const raw = readRefreshCookie(req);
  if (!raw) return;
  const record = await RefreshToken.findOne({ tokenHash: hashToken(raw) }).lean();
  if (!record) return;
  const family = record.familyId ?? String(record._id);
  await RefreshToken.updateMany(
    { $or: [{ familyId: family }, { _id: record._id }], revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export function clearSessionCookies(res: Response): void {
  // Attributes must match the ones used when the cookies were set.
  res.clearCookie(ACCESS_COOKIE, cookieBase());
  res.clearCookie(REFRESH_COOKIE, cookieBase());
}
