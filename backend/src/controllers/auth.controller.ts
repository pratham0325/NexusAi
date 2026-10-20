/** Auth controller — auth routes request handlers. */
import type { Request, Response, NextFunction } from "express";
import { User } from "../models/User.js";
import {
  createGuest,
  login,
  register,
  requestOtp,
  signOut,
  toUserWire,
  verifyOtp,
} from "../services/auth/auth.service.js";
import { rotateRefreshToken } from "../services/auth/session.js";
import { HttpError } from "../utils/http-error.js";
import { formatZodError } from "../utils/http-error.js";
import {
  loginSchema,
  registerSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from "../validators/index.js";

export async function postRegister(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION", formatZodError(parsed.error));
    }
    const result = await register(res, parsed.data);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function postLogin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION", formatZodError(parsed.error));
    }
    const result = await login(res, parsed.data);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function postRequestOtp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = requestOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION", formatZodError(parsed.error));
    }
    const result = await requestOtp(parsed.data.email);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function postVerifyOtp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION", formatZodError(parsed.error));
    }
    const result = await verifyOtp(res, parsed.data.email, parsed.data.code);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function postGuest(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await createGuest(res);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function postRefresh(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId, accessToken } = await rotateRefreshToken(req, res);
    const user = await User.findById(userId);
    if (!user) throw new HttpError(401, "NO_SESSION", "User sign-in expired");
    res.json({
      success: true,
      data: { user: toUserWire(user), accessToken },
    });
  } catch (err) {
    next(err);
  }
}

export async function postLogout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await signOut(req, res);
    res.json({ success: true, data: { signedOut: true } });
  } catch (err) {
    next(err);
  }
}

export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED", "Not signed in");
    const user = await User.findById(req.user.id);
    if (!user) throw new HttpError(401, "UNAUTHENTICATED", "User not found");
    res.json({ success: true, data: { user: toUserWire(user) } });
  } catch (err) {
    next(err);
  }
}
