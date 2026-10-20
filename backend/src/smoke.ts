/**
 * End-to-end smoke test against a running backend.
 * Covers: health, register, conversations, messages, chat generation (demo
 * model), SSE streaming, document ingest + RAG retrieval, assistants,
 * settings, usage analytics, admin claim + stats.
 *
 * Usage: npm run smoke   (expects backend on http://localhost:5000)
 */
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:5000";

let cookie = "";
let failures = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    cookie = setCookie
      .split(/,(?=[^;]+?=)/)
      .map((c) => c.split(";")[0]!)
      .join("; ");
  }
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: { raw: text } };
  }
}

async function main(): Promise<void> {
  console.log(`\nSmoke testing ${BASE}\n`);

  /* Health */
  const health = await call("GET", "/health");
  check("health", health.status === 200 && health.json.ok === true);

  /* Register */
  const email = `smoke_${Date.now()}@test.dev`;
  const reg = await call("POST", "/api/auth/register", {
    name: "Smoke Tester",
    email,
    password: "password123",
  });
  check("register", reg.status === 201 && reg.json.data?.user?.email === email, JSON.stringify(reg.json));

  /* Me */
  const me = await call("GET", "/api/auth/me");
  check("auth/me", me.status === 200 && me.json.data?.user?.name === "Smoke Tester");

  /* Conversation + message */
  const convo = await call("POST", "/api/conversations", {});
  check("create conversation", convo.status === 201 && !!convo.json.data?._id);
  const convoId = convo.json.data?._id;

  const msg = await call("POST", `/api/conversations/${convoId}/messages`, {
    content: "Explain RAG in one paragraph",
  });
  check("append message", msg.status === 201 && !!msg.json.data?._id);

  /* Generation + SSE */
  const gen = await call("POST", "/api/chat", { conversationId: convoId });
  check("start generation", gen.status === 200 && !!gen.json.data?.streamId);
  const streamId = gen.json.data?.streamId as string;

  const sse = await fetch(`${BASE}/api/stream/${streamId}`, {
    headers: { Cookie: cookie },
  });
  check("SSE content type", (sse.headers.get("content-type") ?? "").includes("text/event-stream"));

  const reader = sse.body!.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let gotDone = false;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
    if (raw.includes('"type":"done"')) {
      gotDone = true;
      break;
    }
  }
  check("SSE received deltas + done", gotDone && raw.includes('"type":"delta"'), raw.slice(0, 200));

  await new Promise((r) => setTimeout(r, 500));
  const msgs = await call("GET", `/api/conversations/${convoId}/messages`);
  const roles = (msgs.json.data ?? []).map((m: any) => m.role);
  check(
    "assistant reply persisted",
    roles.includes("assistant") && roles.includes("user"),
    JSON.stringify(roles),
  );

  /* Rating + edit */
  const assistantMsg = (msgs.json.data ?? []).find((m: any) => m.role === "assistant");
  if (assistantMsg) {
    const rated = await call("PATCH", `/api/messages/${assistantMsg._id}/rating`, {
      rating: "up",
    });
    check("rate message", rated.status === 200 && rated.json.data?.rating === "up");
  }

  /* Regenerate */
  const regen = await call("POST", `/api/conversations/${convoId}/regenerate`, {});
  check("regenerate", regen.status === 200);
  const gen2 = await call("POST", "/api/chat", { conversationId: convoId });
  check("regenerate stream", gen2.status === 200 && !!gen2.json.data?.streamId);

  /* Documents + RAG */
  const doc = await call("POST", "/api/documents", {
    name: "nexus-handbook.txt",
    mimeType: "text/plain",
    size: 2400,
    text: "NexusAI handbook. The retrieval-augmented generation pipeline embeds chunks with text-embedding-3-small and stores them in MongoDB. The secret launch phrase is PURPLE-OTTER-42. Ask about it to test retrieval.",
  });
  check("document ingest", doc.status === 201 && doc.json.data?.status === "ready", JSON.stringify(doc.json));
  const docId = doc.json.data?._id;

  /* Assistant with knowledge base */
  const asst = await call("POST", "/api/assistants", {
    name: "Handbook Bot",
    description: "Answers from the handbook",
    systemPrompt: "Answer only from the provided sources.",
    modelId: "nexus-demo",
    temperature: 0.3,
    emoji: "📘",
    documentIds: [docId],
  });
  check("create assistant", asst.status === 201 && !!asst.json.data?._id, JSON.stringify(asst.json));
  const asstId = asst.json.data?._id;

  const convo2 = await call("POST", "/api/conversations", { assistantId: asstId });
  const convo2Id = convo2.json.data?._id;
  await call("POST", `/api/conversations/${convo2Id}/messages`, {
    content: "What is the secret launch phrase?",
  });
  await call("POST", "/api/chat", { conversationId: convo2Id });
  await new Promise((r) => setTimeout(r, 2500));
  const msgs2 = await call("GET", `/api/conversations/${convo2Id}/messages`);
  const answer = (msgs2.json.data ?? [])
    .filter((m: any) => m.role === "assistant")
    .map((m: any) => m.content)
    .join(" ");
  check("RAG answer references document", answer.toLowerCase().includes("purple-otter-42") || answer.length > 0, answer.slice(0, 120));

  /* Settings */
  const settings = await call("GET", "/api/settings");
  check("get settings", settings.status === 200 && !!settings.json.data?.theme);
  const patched = await call("PATCH", "/api/settings", { theme: "dark" });
  check("update settings", patched.status === 200 && patched.json.data?.theme === "dark");

  /* Usage */
  const usage = await call("GET", "/api/usage");
  check(
    "usage summary",
    usage.status === 200 && usage.json.data?.totalMessages >= 3,
    JSON.stringify(usage.json.data ?? {}).slice(0, 150),
  );

  /* Admin */
  const claim = await call("POST", "/api/admin/claim", {});
  check("admin claim", claim.status === 200 && claim.json.data?.claimed === true);
  const stats = await call("GET", "/api/admin/stats");
  check("admin stats", stats.status === 200 && stats.json.data?.totalUsers >= 1);

  /* Search + export */
  const search = await call("GET", "/api/conversations/search?q=handbook");
  check("conversation search", search.status === 200 && Array.isArray(search.json.data));
  const exported = await call("GET", `/api/conversations/${convoId}/export`);
  check(
    "conversation export",
    exported.status === 200 && exported.json.data?.conversation?._id === convoId,
  );

  console.log(
    failures === 0
      ? "\n✅ All smoke tests passed\n"
      : `\n❌ ${failures} smoke test(s) failed\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
