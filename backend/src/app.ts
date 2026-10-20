/** Express app assembly — security, CORS, CSRF, cookies, routes, errors. */
import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { env, isProd } from "./config/env.js";
import router from "./routes/index.js";
import { HttpError } from "./utils/http-error.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function limiter(windowMinutes: number, limit: number) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: { code: "RATE_LIMITED", message: "Too many requests — try again later" },
    },
  });
}

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF defense for cookie-authenticated requests: browsers always attach
 * Origin (or at least Referer) to cross-site state-changing requests, so any
 * such request from a site outside CLIENT_URL is refused. Requests with
 * neither header come from non-browser clients, which have no ambient cookies.
 */
function csrfOriginCheck(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const origin =
    originOf(req.headers.origin) ?? originOf(req.headers.referer as string | undefined);
  if (
    (req.headers.origin || req.headers.referer) &&
    (!origin || !env.CLIENT_ORIGINS.includes(origin))
  ) {
    next(new HttpError(403, "CSRF_REJECTED", "Request origin not allowed"));
    return;
  }
  next();
}

export function createApp(): express.Express {
  const app = express();

  app.set("trust proxy", env.TRUST_PROXY);
  app.disable("x-powered-by");
  app.use(
    helmet({
      // The API only serves JSON and SSE; nothing should render or frame it.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and non-browser requests carry no Origin header.
        callback(null, !origin || env.CLIENT_ORIGINS.includes(origin));
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    }),
  );

  // Liveness: the process is up. Readiness (DB reachable) is /api/health.
  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "nexusai-backend" });
  });
  app.get("/api/health", (_req, res) => {
    const dbReady = mongoose.connection.readyState === 1;
    res.status(dbReady ? 200 : 503).json({
      success: dbReady,
      data: { status: dbReady ? "ok" : "degraded", database: dbReady ? "connected" : "unavailable" },
    });
  });

  app.use(cookieParser());
  app.use("/api", csrfOriginCheck);

  // Bodies: large limits only where attachments/documents are uploaded.
  app.use("/api/conversations/:id/messages", express.json({ limit: "12mb" }));
  app.use("/api/documents", express.json({ limit: "10mb" }));
  app.use(express.json({ limit: "100kb" }));

  app.use("/api/auth/login", limiter(15, 10));
  app.use("/api/auth/register", limiter(15, 10));
  app.use("/api/auth/request-otp", limiter(15, 5));
  app.use("/api/auth/verify-otp", limiter(15, 10));
  app.use("/api/auth/guest", limiter(15, 20));
  app.use("/api/auth/refresh", limiter(15, 60));
  app.use("/api", limiter(1, 300));
  app.use("/api", router);

  // 404 for unknown routes.
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });

  // Central error handler → { success, error } envelope; never leaks internals.
  app.use(
    (
      err: unknown,
      _req: Request,
      res: Response,
      _next: NextFunction,
    ): void => {
      void _next;
      if (err instanceof HttpError) {
        res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
        return;
      }
      const type = (err as { type?: string } | null)?.type;
      if (type === "entity.too.large") {
        res.status(413).json({
          success: false,
          error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" },
        });
        return;
      }
      if (type === "entity.parse.failed" || type === "encoding.unsupported") {
        res.status(400).json({
          success: false,
          error: { code: "BAD_REQUEST", message: "Malformed request body" },
        });
        return;
      }
      if (err instanceof mongoose.Error.CastError) {
        // Malformed ids behave like unknown ids.
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Resource not found" },
        });
        return;
      }
      if (err instanceof mongoose.Error.ValidationError) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION", message: "Invalid data" },
        });
        return;
      }
      console.error(
        "Unhandled error:",
        isProd && err instanceof Error ? `${err.name}: ${err.message}` : err,
      );
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL", message: "Internal server error" },
      });
    },
  );

  return app;
}
