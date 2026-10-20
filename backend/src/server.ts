/** HTTP server bootstrap. */
import { createApp } from "./app.js";
import { connectMongo, disconnectMongo } from "./config/mongo.js";
import { env } from "./config/env.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

process.on("unhandledRejection", (reason) => {
  console.error(
    "[nexusai-backend] unhandled rejection:",
    reason instanceof Error ? `${reason.name}: ${reason.message}` : reason,
  );
});

async function main(): Promise<void> {
  await connectMongo();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`[nexusai-backend] listening on port ${env.PORT}`);
  });
  // Long-lived SSE responses must not be cut by Node's default timeouts.
  server.requestTimeout = 0;
  server.headersTimeout = 65_000;
  server.keepAliveTimeout = 61_000;

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[nexusai-backend] ${signal} received, shutting down…`);
    // Open SSE streams would otherwise hold server.close() forever.
    const force = setTimeout(() => {
      console.error("[nexusai-backend] forced exit after shutdown timeout");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();
    server.closeIdleConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectMongo().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main().catch((err) => {
  console.error(
    "[nexusai-backend] fatal:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
