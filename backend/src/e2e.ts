/**
 * Self-contained E2E suite: boots an in-memory MongoDB, starts the Express
 * app on an ephemeral port, drives the full API flow, then tears down.
 * Exit 0 on success, 1 on failure.
 */
import type { Server } from "node:http";

// "test" skips loading backend/.env (real keys, real MONGODB_URI) and makes
// connectMongo refuse any non-local database.
process.env.NODE_ENV = "test";
process.env.ENABLE_DEV_OTP = "true";
process.env.ADMIN_EMAILS = "grace@example.com,mallory@example.com";
process.env.OPENAI_API_KEY = "";
process.env.GOOGLE_AI_API_KEY = "";
process.env.GROQ_API_KEY = "";
process.env.VLY_INTEGRATION_KEY = "";
process.env.DEFAULT_AI_MODEL = "nexus-demo";

const { MongoMemoryServer } = await import("mongodb-memory-server");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function cookieHeader(cookies: string[]): string {
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

async function call(
  server: Server,
  method: string,
  path: string,
  body?: unknown,
  cookies?: string[],
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; json: any; setCookie: string[] }> {
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookies?.length ? { Cookie: cookieHeader(cookies) } : {}),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie =
    (
      res.headers as unknown as { getSetCookie?: () => string[] }
    ).getSetCookie?.() ?? [];
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json, setCookie };
}

function extractCookies(setCookie: string[]): string[] {
  return setCookie.filter((c) => !/Expires=Thu, 01 Jan 1970/.test(c));
}

async function readSse(
  server: Server,
  streamId: string,
  cookies: string[],
): Promise<any[]> {
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  const res = await fetch(
    `http://127.0.0.1:${addr.port}/api/stream/${streamId}`,
    { headers: { Cookie: cookieHeader(cookies) } },
  );
  const events: any[] = [];
  if (!res.body) return events;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      try {
        const ev = JSON.parse(line.slice(5).trim());
        events.push(ev);
        if (
          ev.type === "done" ||
          ev.type === "error" ||
          ev.type === "timeout"
        ) {
          return events;
        }
      } catch {
        // ignore
      }
    }
  }
  return events;
}

async function main(): Promise<void> {
  const mem = await MongoMemoryServer.create({
    instance: { port: 0, ip: "127.0.0.1" },
  });
  const mongoUri = mem.getUri("nexusai-e2e");
  const mongoHost = new URL(mongoUri).hostname;
  if (mongoHost !== "127.0.0.1" && mongoHost !== "localhost") {
    await mem.stop();
    throw new Error("E2E MongoDB must use a local in-memory server");
  }
  process.env.MONGODB_URI = mongoUri;
  const [{ connectMongo, disconnectMongo }, { createApp }] = await Promise.all([
    import("./config/mongo.js"),
    import("./app.js"),
  ]);
  await connectMongo();

  const app = createApp();
  const server = app.listen(0);

  try {
    /* ─── Health ─────────────────────────────────────────────────────── */
    console.log("\n── Health");
    const health = await call(server, "GET", "/health");
    check("GET /health", health.status === 200 && health.json?.ok === true);

    /* ─── Register / login / me ──────────────────────────────────────── */
    console.log("\n── Password auth");
    const reg = await call(server, "POST", "/api/auth/register", {
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "supersecret1",
    });
    check(
      "register returns user",
      reg.status === 201 && reg.json?.data?.user?.email === "ada@example.com",
      JSON.stringify(reg.json),
    );
    const adaCookies = extractCookies(reg.setCookie);
    check("register sets session cookies", adaCookies.length >= 2);

    const me = await call(server, "GET", "/api/auth/me", undefined, adaCookies);
    check(
      "GET /auth/me with cookie",
      me.status === 200 && me.json?.data?.user?.name === "Ada Lovelace",
    );

    const meNoAuth = await call(server, "GET", "/api/auth/me");
    check("GET /auth/me without cookie → 401", meNoAuth.status === 401);

    const badLogin = await call(server, "POST", "/api/auth/login", {
      email: "ada@example.com",
      password: "wrongpass",
    });
    check("wrong password → 401 INVALID_CREDENTIALS", badLogin.status === 401);

    const logout = await call(
      server,
      "POST",
      "/api/auth/logout",
      undefined,
      adaCookies,
    );
    check("logout ok", logout.status === 200);

    /* ─── Email OTP ──────────────────────────────────────────────────── */
    console.log("\n── Email OTP");
    const otpReq = await call(server, "POST", "/api/auth/request-otp", {
      email: "grace@example.com",
    });
    check(
      "request-otp returns devOtp in dev",
      otpReq.status === 200 && /^\d{6}$/.test(otpReq.json?.data?.devOtp ?? ""),
      JSON.stringify(otpReq.json),
    );
    const devOtp = otpReq.json?.data?.devOtp as string;

    const otpBad = await call(server, "POST", "/api/auth/verify-otp", {
      email: "grace@example.com",
      code: "000000",
    });
    check("wrong OTP → 400", otpBad.status === 400);

    const otpOk = await call(server, "POST", "/api/auth/verify-otp", {
      email: "grace@example.com",
      code: devOtp,
    });
    check(
      "verify-otp signs in + creates user",
      otpOk.status === 200 && otpOk.json?.data?.isNewUser === true,
      JSON.stringify(otpOk.json),
    );
    const graceCookies = extractCookies(otpOk.setCookie);

    /* Bearer-token fallback (cross-site iframe cookie blocking) */
    const graceAccess = otpOk.json?.data?.accessToken as string | undefined;
    check("verify-otp returns accessToken for Bearer fallback", !!graceAccess);
    const meBearer = await call(
      server,
      "GET",
      "/api/auth/me",
      undefined,
      [],
      graceAccess ? { Authorization: `Bearer ${graceAccess}` } : undefined,
    );
    check(
      "GET /auth/me with Bearer token (no cookies)",
      meBearer.status === 200 &&
        meBearer.json?.data?.user?.email === "grace@example.com",
    );

    /* Mirrored refresh-token header (cookie-less silent restore).
       Uses a second OTP session so grace's cookie token stays single-use. */
    const otpReq2 = await call(server, "POST", "/api/auth/request-otp", {
      email: "grace@example.com",
    });
    const devOtp2 = otpReq2.json?.data?.devOtp as string;
    const otpOk2 = await call(server, "POST", "/api/auth/verify-otp", {
      email: "grace@example.com",
      code: devOtp2,
    });
    const rawRefresh = otpOk2.setCookie
      .find((c) => c.trimStart().toLowerCase().startsWith("refreshtoken="))
      ?.trim()
      .slice("refreshToken=".length)
      .split(";")[0];
    const refreshHdr = await call(
      server,
      "POST",
      "/api/auth/refresh",
      undefined,
      [],
      rawRefresh ? { "x-refresh-token": rawRefresh } : undefined,
    );
    check(
      "refresh tokens are accepted only from the httpOnly cookie, not headers",
      refreshHdr.status === 401,
      JSON.stringify(refreshHdr.json),
    );
    check(
      "auth responses never expose a refresh token in JSON",
      otpOk.json?.data?.refreshToken === undefined &&
        reg.json?.data?.refreshToken === undefined,
    );

    /* ─── Guest ──────────────────────────────────────────────────────── */
    console.log("\n── Guest session");
    const guest = await call(server, "POST", "/api/auth/guest");
    check(
      "guest session created",
      guest.status === 200 && guest.json?.data?.user?.isAnonymous === true,
    );
    const guestCookies = extractCookies(guest.setCookie);
    const secondGuest = await call(server, "POST", "/api/auth/guest");
    check(
      "multiple independent guest sessions can be created",
      secondGuest.status === 200 &&
        secondGuest.json?.data?.user?.isAnonymous === true &&
        secondGuest.json?.data?.user?._id !== guest.json?.data?.user?._id,
      JSON.stringify(secondGuest.json),
    );

    /* ─── Conversations ──────────────────────────────────────────────── */
    console.log("\n── Available models");
    const availableModels = await call(
      server,
      "GET",
      "/api/models",
      undefined,
      graceCookies,
    );
    const modelIds = availableModels.json?.data?.modelIds as
      | string[]
      | undefined;
    const recommendedModelId =
      availableModels.json?.data?.recommendedDefaultModelId;
    check(
      "model discovery returns configured models and a valid recommendation",
      availableModels.status === 200 &&
        Array.isArray(modelIds) &&
        modelIds.length > 0 &&
        typeof recommendedModelId === "string" &&
        modelIds.includes(recommendedModelId),
      JSON.stringify(availableModels.json),
    );
    const unavailableModel = await call(
      server,
      "POST",
      "/api/conversations",
      { modelId: "gpt-4o-mini" },
      graceCookies,
    );
    check(
      "conversation rejects a model without its provider key",
      unavailableModel.status === 400 &&
        unavailableModel.json?.error?.code === "MODEL_UNAVAILABLE",
      JSON.stringify(unavailableModel.json),
    );

    /* ─── Conversations ──────────────────────────────────────────────── */
    console.log("\n── Conversations");
    const empty = await call(
      server,
      "GET",
      "/api/conversations",
      undefined,
      graceCookies,
    );
    check(
      "empty conversation list",
      empty.status === 200 && empty.json.data.length === 0,
    );

    const defaultConversation = await call(
      server,
      "POST",
      "/api/conversations",
      {},
      graceCookies,
    );
    check(
      "new conversation uses available recommended model",
      defaultConversation.status === 201 &&
        defaultConversation.json?.data?.modelId === recommendedModelId,
      JSON.stringify(defaultConversation.json),
    );

    const create1 = await call(
      server,
      "POST",
      "/api/conversations",
      { modelId: "nexus-demo" },
      graceCookies,
    );
    check(
      "create conversation",
      create1.status === 201 && create1.json?.data?._id,
    );
    const convoId = create1.json.data._id as string;

    const append = await call(
      server,
      "POST",
      `/api/conversations/${convoId}/messages`,
      {
        content: "Hello Nexus, what can you do?",
        attachments: [
          {
            name: "notes.txt",
            mimeType: "text/plain",
            kind: "text",
            content: "These notes describe the project.",
          },
          {
            name: "diagram.png",
            mimeType: "image/png",
            kind: "image",
            content: "data:image/png;base64,aGVsbG8=",
          },
        ],
      },
      graceCookies,
    );
    check(
      "append user message with attachments",
      append.status === 201 &&
        append.json?.data?.attachments?.length === 2 &&
        append.json.data.attachments[0].name === "notes.txt" &&
        !("content" in append.json.data.attachments[0]),
    );

    const after = await call(
      server,
      "GET",
      `/api/conversations/${convoId}`,
      undefined,
      graceCookies,
    );
    check(
      "conversation auto-titled from first message",
      (after.json?.data?.title as string)?.length > 5,
      after.json?.data?.title,
    );

    /* ─── Generation + SSE ───────────────────────────────────────────── */
    console.log("\n── Generation (SSE)");
    const gen = await call(
      server,
      "POST",
      "/api/chat",
      { conversationId: convoId },
      graceCookies,
    );
    const streamId = gen.json?.data?.streamId as string;
    check("POST /chat returns streamId", gen.status === 200 && !!streamId);

    const events = await readSse(server, streamId, graceCookies);
    const deltas = events.filter((e) => e.type === "delta");
    const done = events.find((e) => e.type === "done");
    const fullText = deltas.map((d) => d.text as string).join("");
    check("SSE delivered deltas", deltas.length > 2, `got ${deltas.length}`);
    check(
      "SSE finished with done + persisted text",
      !!done && typeof done.text === "string" && done.text.length > 20,
    );
    check(
      "streamed text matches persisted message",
      done?.text === fullText && fullText.length > 20,
    );

    const groqConvo = await call(
      server,
      "POST",
      "/api/conversations",
      { modelId: "openai/gpt-oss-20b" },
      graceCookies,
    );
    check(
      "unconfigured Groq model is rejected before generation",
      groqConvo.status === 400 &&
        groqConvo.json?.error?.code === "MODEL_UNAVAILABLE",
      JSON.stringify(groqConvo.json),
    );

    const { env } = await import("./config/env.js");
    const originalFetch = globalThis.fetch;
    const originalGroqKey = env.GROQ_API_KEY;
    const originalGroqBaseUrl = env.GROQ_BASE_URL;
    const providerFetch = originalFetch.bind(globalThis);
    let providerCalls = 0;
    env.GROQ_API_KEY = "e2e-provider-key";
    env.GROQ_BASE_URL = "http://groq-e2e.invalid";
    globalThis.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.startsWith(env.GROQ_BASE_URL)) {
        providerCalls++;
        return new Response("{}", { status: 503 });
      }
      return providerFetch(input, init);
    };
    try {
      const failedProviderConversation = await call(
        server,
        "POST",
        "/api/conversations",
        { modelId: "qwen/qwen3.8-27b" },
        graceCookies,
      );
      const failedProviderConversationId = failedProviderConversation.json?.data
        ?._id as string;
      await call(
        server,
        "POST",
        `/api/conversations/${failedProviderConversationId}/messages`,
        { content: "Check provider error handling" },
        graceCookies,
      );
      const failedProviderGeneration = await call(
        server,
        "POST",
        "/api/chat",
        { conversationId: failedProviderConversationId },
        graceCookies,
      );
      const failedProviderEvents = await readSse(
        server,
        failedProviderGeneration.json?.data?.streamId as string,
        graceCookies,
      );
      check(
        "provider HTTP failures do not trigger a slow completion retry",
        providerCalls === 1 &&
          failedProviderEvents.some(
            (event) =>
              event.type === "error" &&
              event.message ===
                "The AI provider returned an error. Try again or pick another model.",
          ),
        `provider requests: ${providerCalls}`,
      );
    } finally {
      globalThis.fetch = originalFetch;
      env.GROQ_API_KEY = originalGroqKey;
      env.GROQ_BASE_URL = originalGroqBaseUrl;
    }

    const msgs = await call(
      server,
      "GET",
      `/api/conversations/${convoId}/messages`,
      undefined,
      graceCookies,
    );
    check(
      "assistant message persisted",
      msgs.json?.data?.some(
        (m: any) => m.role === "assistant" && m.content === done?.text,
      ),
    );

    /* ─── Rating / edit / regenerate ─────────────────────────────────── */
    console.log("\n── Messages");
    const assistantMsg = msgs.json.data.find(
      (m: any) => m.role === "assistant",
    );
    const rated = await call(
      server,
      "PATCH",
      `/api/messages/${assistantMsg._id}/rating`,
      { rating: "up" },
      graceCookies,
    );
    check("rate message up", rated.json?.data?.rating === "up");

    const unrate = await call(
      server,
      "PATCH",
      `/api/messages/${assistantMsg._id}/rating`,
      { rating: null },
      graceCookies,
    );
    check("clear rating", unrate.json?.data?.rating === null);

    const create2 = await call(
      server,
      "POST",
      "/api/conversations",
      {},
      graceCookies,
    );
    const convo2 = create2.json.data._id as string;
    await call(
      server,
      "POST",
      `/api/conversations/${convo2}/messages`,
      { content: "Edit me please" },
      graceCookies,
    );
    const gen2 = await call(
      server,
      "POST",
      "/api/chat",
      { conversationId: convo2 },
      graceCookies,
    );
    await readSse(server, gen2.json.data.streamId, graceCookies);
    const msgs2 = await call(
      server,
      "GET",
      `/api/conversations/${convo2}/messages`,
      undefined,
      graceCookies,
    );
    const userMsg2 = msgs2.json.data.find((m: any) => m.role === "user");
    const edited = await call(
      server,
      "PATCH",
      `/api/messages/${userMsg2._id}`,
      { content: "Edited content" },
      graceCookies,
    );
    check("edit message sets editedAt", edited.json?.data?.editedAt !== null);

    const search = await call(
      server,
      "GET",
      "/api/conversations/search?q=Edited",
      undefined,
      graceCookies,
    );
    check(
      "search finds conversation by content",
      search.json.data.length === 1,
    );

    const regen = await call(
      server,
      "POST",
      `/api/conversations/${convoId}/regenerate`,
      undefined,
      graceCookies,
    );
    check(
      "regenerate ok",
      regen.status === 200 && regen.json?.data?.ok === true,
    );

    const exportRes = await call(
      server,
      "GET",
      `/api/conversations/${convoId}/export`,
      undefined,
      graceCookies,
    );
    check(
      "export returns conversation + messages",
      exportRes.json?.data?.conversation?._id === convoId &&
        Array.isArray(exportRes.json.data.messages),
    );

    const patchConvo = await call(
      server,
      "PATCH",
      `/api/conversations/${convoId}`,
      { pinned: true },
      graceCookies,
    );
    check("patch conversation pinned", patchConvo.json?.data?.pinned === true);

    /* ─── Documents + RAG ────────────────────────────────────────────── */
    console.log("\n── Documents + RAG");
    const ingest = await call(
      server,
      "POST",
      "/api/documents",
      {
        name: "handbook.txt",
        mimeType: "text/plain",
        size: 4000,
        text: "The NexusAI company handbook states that employees receive 25 days of paid vacation per year. Remote work is allowed on Fridays. The office cafeteria serves lunch between 12pm and 2pm. Vacation requests must be submitted at least two weeks in advance through the HR portal.",
      },
      graceCookies,
    );
    check(
      "document ingested + chunked",
      ingest.status === 201 &&
        ingest.json?.data?.status === "ready" &&
        ingest.json.data.chunkCount > 0,
      JSON.stringify(ingest.json?.data?.status),
    );
    const docId = ingest.json.data._id as string;

    const docsList = await call(
      server,
      "GET",
      "/api/documents",
      undefined,
      graceCookies,
    );
    check("documents listed", docsList.json.data.length === 1);

    /* ─── Assistants (RAG chat) ──────────────────────────────────────── */
    console.log("\n── Assistants + RAG chat");
    const ast = await call(
      server,
      "POST",
      "/api/assistants",
      {
        name: "HR Helper",
        description: "Answers handbook questions",
        systemPrompt: "You answer strictly from the handbook.",
        modelId: "nexus-demo",
        temperature: 0.5,
        emoji: "📋",
        documentIds: [docId],
      },
      graceCookies,
    );
    check(
      "assistant created",
      ast.status === 201 && ast.json?.data?.name === "HR Helper",
    );
    const astId = ast.json.data._id as string;

    const astList = await call(
      server,
      "GET",
      "/api/assistants",
      undefined,
      graceCookies,
    );
    check("assistants listed", astList.json.data.length === 1);

    const ragConvo = await call(
      server,
      "POST",
      "/api/conversations",
      { modelId: "nexus-demo", assistantId: astId },
      graceCookies,
    );
    const ragConvoId = ragConvo.json.data._id as string;
    await call(
      server,
      "POST",
      `/api/conversations/${ragConvoId}/messages`,
      { content: "How many vacation days do employees get?" },
      graceCookies,
    );
    const ragGen = await call(
      server,
      "POST",
      "/api/chat",
      { conversationId: ragConvoId },
      graceCookies,
    );
    const ragEvents = await readSse(
      server,
      ragGen.json.data.streamId,
      graceCookies,
    );
    const ragText = ragEvents
      .filter((e) => e.type === "delta")
      .map((d) => d.text)
      .join("");
    check(
      "RAG-grounded answer references the document",
      ragText.includes("vacation") || ragText.includes("documents"),
      ragText.slice(0, 80),
    );

    /* ─── Settings ───────────────────────────────────────────────────── */
    console.log("\n── Settings");
    const settings = await call(
      server,
      "GET",
      "/api/settings",
      undefined,
      graceCookies,
    );
    check("settings defaults", settings.json?.data?.theme === "system");
    const patched = await call(
      server,
      "PATCH",
      "/api/settings",
      { theme: "dark", temperature: 0.3 },
      graceCookies,
    );
    check("settings updated", patched.json?.data?.theme === "dark");

    /* ─── Usage + admin ──────────────────────────────────────────────── */
    console.log("\n── Usage + Admin");
    const usage = await call(
      server,
      "GET",
      "/api/usage",
      undefined,
      graceCookies,
    );
    check(
      "usage summary counts generations",
      usage.json?.data?.assistantMessages >= 1 &&
        usage.json?.data?.totalCompletionChars > 0 &&
        usage.json?.data?.days?.length === 30,
      JSON.stringify({
        assistantMessages: usage.json?.data?.assistantMessages,
        totalCompletionChars: usage.json?.data?.totalCompletionChars,
      }),
    );

    const statsBefore = await call(
      server,
      "GET",
      "/api/admin/stats",
      undefined,
      graceCookies,
    );
    check("non-admin sees null stats", statsBefore.json?.data === null);

    const unauthorizedClaim = await call(
      server,
      "POST",
      "/api/admin/claim",
      undefined,
      guestCookies,
    );
    check(
      "non-allowlisted account cannot claim admin access",
      unauthorizedClaim.status === 403,
    );

    // Password sign-up does not prove email ownership, so an allowlisted
    // address registered by a squatter must not be able to claim admin.
    const squatter = await call(server, "POST", "/api/auth/register", {
      name: "Mallory",
      email: "mallory@example.com",
      password: "squatter-pass-1",
      role: "admin",
    });
    check(
      "register ignores a client-supplied role",
      squatter.status === 201 && squatter.json?.data?.user?.role === "user",
    );
    const squatterClaim = await call(
      server,
      "POST",
      "/api/admin/claim",
      undefined,
      extractCookies(squatter.setCookie),
    );
    check(
      "allowlisted but unverified email cannot claim admin",
      squatterClaim.status === 403 &&
        squatterClaim.json?.error?.code === "EMAIL_NOT_VERIFIED",
      JSON.stringify(squatterClaim.json),
    );

    const claim = await call(
      server,
      "POST",
      "/api/admin/claim",
      undefined,
      graceCookies,
    );
    check("first admin claim succeeds", claim.json?.data?.claimed === true);

    const statsAfter = await call(
      server,
      "GET",
      "/api/admin/stats",
      undefined,
      graceCookies,
    );
    check(
      "admin sees platform stats",
      statsAfter.json?.data?.totalUsers >= 3 &&
        Array.isArray(statsAfter.json?.data?.users),
      JSON.stringify(statsAfter.json?.data?.totalUsers),
    );

    const claim2 = await call(
      server,
      "POST",
      "/api/admin/claim",
      undefined,
      guestCookies,
    );
    check("second claim refused", claim2.json?.data?.claimed === false);

    /* ─── Ownership isolation ────────────────────────────────────────── */
    console.log("\n── Security");
    const crossRead = await call(
      server,
      "GET",
      `/api/conversations/${convoId}`,
      undefined,
      guestCookies,
    );
    check("cannot read another user's conversation", crossRead.status === 404);

    const crossDelete = await call(
      server,
      "DELETE",
      `/api/documents/${docId}`,
      undefined,
      guestCookies,
    );
    check("cannot delete another user's document", crossDelete.status === 404);

    const del = await call(
      server,
      "DELETE",
      `/api/documents/${docId}`,
      undefined,
      graceCookies,
    );
    check("owner can delete document", del.status === 200);

    /* ─── Refresh rotation ───────────────────────────────────────────── */
    console.log("\n── Session refresh");
    const refresh = await call(
      server,
      "POST",
      "/api/auth/refresh",
      undefined,
      graceCookies,
    );
    check(
      "refresh rotates session",
      refresh.status === 200 &&
        refresh.json?.data?.user?.email === "grace@example.com",
      JSON.stringify(refresh.json),
    );
    check(
      "refresh response carries accessToken",
      !!refresh.json?.data?.accessToken,
    );
    const refreshReuse = await call(
      server,
      "POST",
      "/api/auth/refresh",
      undefined,
      graceCookies,
    );
    check("old refresh token is single-use → 401", refreshReuse.status === 401);

    /* ─── Hardening regressions ──────────────────────────────────────── */
    console.log("\n── Hardening");
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no addr");
    const base = `http://127.0.0.1:${addr.port}`;
    const [{ default: jwt }, { env: liveEnv }, { RefreshToken }] =
      await Promise.all([
        import("jsonwebtoken"),
        import("./config/env.js"),
        import("./models/RefreshToken.js"),
      ]);
    const graceUserId = (
      await call(server, "GET", "/api/auth/me", undefined, graceCookies)
    ).json?.data?.user?._id as string;

    const forgedNone =
      Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") +
      "." +
      Buffer.from(JSON.stringify({ sub: graceUserId, role: "admin" })).toString("base64url") +
      ".";
    const forgedWrongKey = jwt.sign({ role: "admin" }, "attacker-secret", {
      subject: graceUserId,
      issuer: "nexusai-backend",
      audience: "nexusai-api",
    });
    const missingAudience = jwt.sign(
      { sub: graceUserId, role: "user" },
      liveEnv.JWT_ACCESS_SECRET,
    );
    const expired = jwt.sign({ role: "user" }, liveEnv.JWT_ACCESS_SECRET, {
      subject: graceUserId,
      issuer: "nexusai-backend",
      audience: "nexusai-api",
      expiresIn: -10,
    });
    for (const [label, token] of [
      ["alg=none", forgedNone],
      ["wrong signing key", forgedWrongKey],
      ["missing issuer/audience", missingAudience],
      ["expired", expired],
    ] as const) {
      const r = await call(server, "GET", "/api/auth/me", undefined, [], {
        Authorization: `Bearer ${token}`,
      });
      check(`JWT rejected: ${label}`, r.status === 401);
    }

    // Refresh-token reuse after the grace window revokes the whole family.
    const victim = await call(server, "POST", "/api/auth/register", {
      name: "Victim",
      email: "victim@example.com",
      password: "victim-pass-1",
    });
    const victimCookies1 = extractCookies(victim.setCookie);
    const rotated = await call(
      server,
      "POST",
      "/api/auth/refresh",
      undefined,
      victimCookies1,
    );
    const victimCookies2 = extractCookies(rotated.setCookie);
    check(
      "victim refresh rotates",
      rotated.status === 200 && victimCookies2.length >= 2,
    );
    await RefreshToken.updateMany(
      { revokedAt: { $ne: null } },
      { $set: { revokedAt: new Date(Date.now() - 60_000) } },
    );
    const replay = await call(
      server,
      "POST",
      "/api/auth/refresh",
      undefined,
      victimCookies1,
    );
    check("replayed rotated refresh token → 401", replay.status === 401);
    const afterReplay = await call(
      server,
      "POST",
      "/api/auth/refresh",
      undefined,
      victimCookies2,
    );
    check(
      "token reuse revokes the newer token in the same family",
      afterReplay.status === 401,
    );

    // Logout revokes the server-side refresh token.
    const sess = await call(server, "POST", "/api/auth/login", {
      email: "victim@example.com",
      password: "victim-pass-1",
    });
    const sessCookies = extractCookies(sess.setCookie);
    await call(server, "POST", "/api/auth/logout", undefined, sessCookies);
    const afterLogout = await call(
      server,
      "POST",
      "/api/auth/refresh",
      undefined,
      sessCookies,
    );
    check("refresh after logout → 401", afterLogout.status === 401);

    // OTP codes are single-use.
    const otpReplay = await call(server, "POST", "/api/auth/verify-otp", {
      email: "grace@example.com",
      code: devOtp2,
    });
    check("OTP code cannot be reused", otpReplay.status === 400);

    // CSRF: cookie-authenticated writes from foreign origins are refused.
    const csrf = await call(server, "POST", "/api/conversations", {}, graceCookies, {
      Origin: "https://evil.example",
    });
    check("cross-site POST with foreign Origin → 403", csrf.status === 403);
    const csrfReferer = await call(
      server,
      "POST",
      "/api/auth/logout",
      undefined,
      graceCookies,
      { Referer: "https://evil.example/page" },
    );
    check("cross-site POST with foreign Referer → 403", csrfReferer.status === 403);
    const sameOrigin = await call(server, "POST", "/api/conversations", {}, graceCookies, {
      Origin: "http://localhost:5173",
    });
    check(
      "POST from the configured frontend origin succeeds",
      sameOrigin.status === 201,
    );

    // CORS does not reflect arbitrary origins.
    const preflight = await fetch(`${base}/api/conversations`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
      },
    });
    check(
      "CORS preflight from foreign origin gets no allow-origin",
      preflight.headers.get("access-control-allow-origin") === null,
    );
    const goodPreflight = await fetch(`${base}/api/conversations`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
      },
    });
    check(
      "CORS preflight from frontend origin is allowed with credentials",
      goodPreflight.headers.get("access-control-allow-origin") ===
        "http://localhost:5173" &&
        goodPreflight.headers.get("access-control-allow-credentials") === "true",
    );

    // Input handling.
    const malformedId = await call(
      server,
      "GET",
      "/api/conversations/not-an-id",
      undefined,
      graceCookies,
    );
    check("malformed ObjectId → 404, not 500", malformedId.status === 404);
    const injection = await call(server, "POST", "/api/auth/login", {
      email: { $gt: "" },
      password: { $gt: "" },
    });
    check("NoSQL operator injection in login → 400", injection.status === 400);
    const oversized = await call(
      server,
      "POST",
      "/api/conversations",
      { title: "x".repeat(200_000) },
      graceCookies,
    );
    check("oversized JSON body → 413", oversized.status === 413);
    const badJson = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    check("malformed JSON → 400", badJson.status === 400);
    const unknownModel = await call(
      server,
      "POST",
      "/api/conversations",
      { modelId: "attacker/expensive-model" },
      graceCookies,
    );
    check("unknown model id rejected", unknownModel.status === 400);
    const errBody =
      JSON.stringify(malformedId.json ?? {}) + JSON.stringify(injection.json ?? {});
    check(
      "error responses carry no stack traces",
      !/at \w+ \(|node_modules|\.ts:\d+/.test(errBody),
    );

    // Cross-user access to messages, streams and documents.
    const graceMsgs = await call(
      server,
      "GET",
      `/api/conversations/${convoId}/messages`,
      undefined,
      graceCookies,
    );
    const graceMsgId = graceMsgs.json?.data?.[0]?._id as string;
    const crossEdit = await call(
      server,
      "PATCH",
      `/api/messages/${graceMsgId}`,
      { content: "hijacked" },
      guestCookies,
    );
    check("cannot edit another user's message", crossEdit.status === 404);
    const crossExport = await call(
      server,
      "GET",
      `/api/conversations/${convoId}/export`,
      undefined,
      guestCookies,
    );
    check(
      "cannot export another user's conversation",
      crossExport.status === 404,
    );
    const crossGen = await call(
      server,
      "POST",
      "/api/chat",
      { conversationId: convoId },
      guestCookies,
    );
    check(
      "cannot start generation in another user's conversation",
      crossGen.status === 404,
    );
    const crossStream = await fetch(`${base}/api/stream/${streamId}`, {
      headers: { Cookie: cookieHeader(guestCookies) },
    });
    check("cannot subscribe to another user's stream", crossStream.status === 404);
    const crossStop = await call(
      server,
      "POST",
      "/api/chat/stop",
      { streamId },
      guestCookies,
    );
    check(
      "cannot stop another user's stream",
      crossStop.json?.data?.stopped === false,
    );

    const privateDoc = await call(
      server,
      "POST",
      "/api/documents",
      {
        name: "secret.txt",
        mimeType: "text/plain",
        size: 40,
        text: "Grace's private salary is 123456.",
      },
      graceCookies,
    );
    const privateDocId = privateDoc.json?.data?._id as string;
    const guestDocs = await call(
      server,
      "GET",
      "/api/documents",
      undefined,
      guestCookies,
    );
    check(
      "document list never includes other users' documents",
      Array.isArray(guestDocs.json?.data) &&
        !guestDocs.json.data.some((d: { _id: string }) => d._id === privateDocId),
    );
    const stealAssistant = await call(
      server,
      "POST",
      "/api/assistants",
      { name: "Thief", modelId: "nexus-demo", documentIds: [privateDocId] },
      guestCookies,
    );
    check(
      "cannot attach another user's document to an assistant",
      stealAssistant.status === 404,
    );
    const guestStats = await call(
      server,
      "GET",
      "/api/admin/stats",
      undefined,
      guestCookies,
    );
    check("non-admin receives no admin data", guestStats.json?.data === null);
    const settingsRole = await call(
      server,
      "PATCH",
      "/api/settings",
      { theme: "light", role: "admin", userId: graceUserId },
      guestCookies,
    );
    const guestMe = await call(server, "GET", "/api/auth/me", undefined, guestCookies);
    check(
      "protected fields in settings patch are ignored",
      settingsRole.status === 200 && guestMe.json?.data?.user?.role === "user",
    );

    const readiness = await call(server, "GET", "/api/health");
    check(
      "readiness health reports database state",
      readiness.status === 200 && readiness.json?.data?.database === "connected",
    );

    /* ─── Validation ─────────────────────────────────────────────────── */
    console.log("\n── Validation");
    const badReg = await call(server, "POST", "/api/auth/register", {
      name: "",
      email: "not-an-email",
      password: "short",
    });
    check("register validation rejects bad input", badReg.status === 400);
    const longMsg = await call(
      server,
      "POST",
      `/api/conversations/${convoId}/messages`,
      { content: "" },
      graceCookies,
    );
    check("empty message rejected", longMsg.status === 400);

    /* ─── Production config gate ─────────────────────────────────────── */
    console.log("\n── Production config");
    const { spawnSync } = await import("node:child_process");
    const bootConfig = (overrides: Record<string, string>) =>
      spawnSync(process.execPath, ["--import", "tsx", "src/config/env.ts"], {
        env: {
          PATH: process.env.PATH ?? "",
          SystemRoot: process.env.SystemRoot ?? "",
          NODE_ENV: "production",
          MONGODB_URI: "mongodb://127.0.0.1:27017/config-check",
          CLIENT_URL: "https://app.example.com",
          ENABLE_DEV_OTP: "false",
          JWT_ACCESS_SECRET: "a".repeat(20) + "b".repeat(20),
          JWT_REFRESH_SECRET: "c".repeat(20) + "d".repeat(20),
          ...overrides,
        },
        encoding: "utf8",
      }).status;
    check("valid production config boots", bootConfig({}) === 0);
    check(
      "placeholder JWT secret refused in production",
      bootConfig({ JWT_ACCESS_SECRET: "replace-with-a-random-secret-at-least-32-characters" }) === 1,
    );
    check(
      "short JWT secret refused in production",
      bootConfig({ JWT_REFRESH_SECRET: "too-short" }) === 1,
    );
    check(
      "identical JWT secrets refused in production",
      bootConfig({ JWT_REFRESH_SECRET: "a".repeat(20) + "b".repeat(20) }) === 1,
    );
    check(
      "http or wildcard CLIENT_URL refused in production",
      bootConfig({ CLIENT_URL: "http://app.example.com" }) === 1 &&
        bootConfig({ CLIENT_URL: "*" }) === 1,
    );
    check(
      "ENABLE_DEV_OTP=true refused in production",
      bootConfig({ ENABLE_DEV_OTP: "true" }) === 1,
    );
  } finally {
    server.close();
    await disconnectMongo().catch(() => undefined);
    await mem.stop().catch(() => undefined);
  }

  console.log(`\n════════════════════════════════`);
  console.log(`  E2E: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("  Failures:");
    for (const f of failures) console.log(`   • ${f}`);
  }
  console.log(`════════════════════════════════`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("E2E fatal:", err);
  process.exit(1);
});
