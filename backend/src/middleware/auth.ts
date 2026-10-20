/** Auth middleware — JWT access-token verification + role guards. */
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { HttpError } from "../utils/http-error.js";

export interface SessionUser {
  id: string;
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

const JWT_ALGORITHM = "HS256" as const;
const JWT_ISSUER = "nexusai-backend";
const JWT_AUDIENCE = "nexusai-api";

export function signAccessToken(payload: { sub: string; role: string }): string {
  return jwt.sign({ role: payload.role }, env.JWT_ACCESS_SECRET, {
    algorithm: JWT_ALGORITHM,
    subject: payload.sub,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
  });
}

/** Verifies an access token; throws on bad signature, alg, iss, aud or expiry. */
export function verifyAccessToken(token: string): SessionUser {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  if (
    typeof decoded !== "object" ||
    typeof decoded.sub !== "string" ||
    !/^[a-f0-9]{24}$/i.test(decoded.sub)
  ) {
    throw new HttpError(401, "UNAUTHENTICATED", "Invalid token");
  }
  return { id: decoded.sub, role: String(decoded.role ?? "user") };
}

/** Attaches req.user from the access-token cookie or Bearer header. */
export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const header = req.headers.authorization;
    const bearer =
      typeof header === "string" && /^Bearer\s+/i.test(header)
        ? header.replace(/^Bearer\s+/i, "").trim()
        : undefined;
    const cookie = req.cookies?.["accessToken"];
    const token = typeof cookie === "string" && cookie ? cookie : bearer;
    if (!token) {
      throw new HttpError(401, "UNAUTHENTICATED", "Not signed in");
    }
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    if (err instanceof HttpError) {
      next(err);
      return;
    }
    next(new HttpError(401, "UNAUTHENTICATED", "Invalid or expired token"));
  }
}

/** Admin guard — checks the role in the database, not just the token claim. */
export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED", "Not signed in");
    const user = await User.findById(req.user.id).select("role").lean();
    if (user?.role !== "admin") {
      throw new HttpError(403, "FORBIDDEN", "Admin access required");
    }
    next();
  } catch (err) {
    next(err);
  }
}
