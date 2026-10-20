/** API router — every endpoint the frontend consumes. */
import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import * as auth from "../controllers/auth.controller.js";
import * as convos from "../controllers/conversations.controller.js";
import * as misc from "../controllers/misc.controller.js";
import { postGenerate, postStop, getStreamSse } from "../controllers/chat.controller.js";
import rateLimit from "express-rate-limit";

/** Per-user limiter (runs after authMiddleware so req.user is trusted). */
function userLimiter(windowMinutes: number, limit: number) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `user:${req.user?.id ?? "anonymous"}`,
    message: {
      success: false,
      error: { code: "RATE_LIMITED", message: "Too many requests — try again later" },
    },
  });
}

const generationLimiter = userLimiter(1, 20);
const generationHourlyLimiter = userLimiter(60, 300);
const documentWriteLimiter = userLimiter(60, 20);
const adminLimiter = userLimiter(15, 5);
const searchLimiter = userLimiter(1, 30);

const router = Router();

router.get("/models", authMiddleware, misc.getAvailableModels);

/* ─── Auth ─────────────────────────────────────────────────────────────── */
router.post("/auth/register", auth.postRegister);
router.post("/auth/login", auth.postLogin);
router.post("/auth/request-otp", auth.postRequestOtp);
router.post("/auth/verify-otp", auth.postVerifyOtp);
router.post("/auth/guest", auth.postGuest);
router.post("/auth/refresh", auth.postRefresh);
router.post("/auth/logout", auth.postLogout);
router.get("/auth/me", authMiddleware, auth.getMe);

/* ─── Conversations & messages ─────────────────────────────────────────── */
router.use("/conversations", authMiddleware);
router.use("/messages", authMiddleware);
router.get("/conversations", convos.listConversations);
router.get("/conversations/search", searchLimiter, convos.searchConversations);
router.post("/conversations", convos.createConversation);
router.get("/conversations/:id", convos.getConversation);
router.patch("/conversations/:id", convos.patchConversation);
router.delete("/conversations/:id", convos.deleteConversation);
router.get("/conversations/:id/messages", convos.listMessages);
router.post("/conversations/:id/messages", convos.appendMessage);
router.get("/conversations/:id/export", convos.exportConversation);
router.post("/conversations/:id/regenerate", generationLimiter, convos.regenerate);
router.patch("/messages/:messageId", convos.editMessage);
router.patch("/messages/:messageId/rating", convos.rateMessage);

/* ─── Chat generation + SSE ───────────────────────────────────────────── */
router.post(
  "/chat",
  authMiddleware,
  generationLimiter,
  generationHourlyLimiter,
  postGenerate,
);
router.post("/chat/stop", authMiddleware, postStop);
router.get("/stream/:streamId", authMiddleware, getStreamSse);

/* ─── Assistants ──────────────────────────────────────────────────────── */
router.use("/assistants", authMiddleware);
router.get("/assistants", misc.getAssistants);
router.get("/assistants/:id", misc.getAssistant);
router.post("/assistants", misc.postAssistant);
router.patch("/assistants/:id", misc.patchAssistant);
router.delete("/assistants/:id", misc.deleteAssistant);

/* ─── Documents (RAG) ─────────────────────────────────────────────────── */
router.use("/documents", authMiddleware);
router.get("/documents", misc.getDocuments);
router.post("/documents", documentWriteLimiter, misc.postDocument);
router.delete("/documents/:id", misc.deleteDocument);

/* ─── Settings ────────────────────────────────────────────────────────── */
router.get("/settings", authMiddleware, misc.getMySettings);
router.patch("/settings", authMiddleware, misc.patchMySettings);

/* ─── Usage + Admin ───────────────────────────────────────────────────── */
router.get("/usage", authMiddleware, misc.getUsage);
router.get("/admin/stats", authMiddleware, misc.getAdminStats);
router.post("/admin/claim", authMiddleware, adminLimiter, misc.postAdminClaim);

export default router;
