/**
 * Vite plugin — starts the NexusAI Express backend alongside the dev server
 * so `/api` requests (proxied to :5000) always have a live backend, including
 * in managed environments where only `vite` is launched. No-ops on production
 * builds and when something is already listening on the backend port.
 */
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const BACKEND_PORT = Number(process.env.BACKEND_PORT ?? 5000);

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1200);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
    socket.connect(port, "127.0.0.1");
  });
}

export function backendPlugin(): Plugin {
  let child: ChildProcess | null = null;

  return {
    name: "nexusai-backend",
    apply: "serve",

    async buildStart() {
      if (await portInUse(BACKEND_PORT)) return;

      const backendDir = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../backend",
      );
      const tsx = path.join(backendDir, "node_modules", ".bin", "tsx");
      const runner = process.platform === "win32" ? `${tsx}.cmd` : tsx;

      child = spawn(
        process.platform === "win32" ? runner : process.execPath,
        process.platform === "win32" ? ["src/server.ts"] : [runner, "src/server.ts"],
        {
        cwd: backendDir,
        stdio: "inherit",
        env: { ...process.env, NODE_ENV: "development" },
          shell: process.platform === "win32",
        },
      );
      child.on("error", (err) =>
        console.error("[nexusai-backend] failed to start:", err.message),
      );
      child.on("exit", (code) => {
        if (code && code !== 0) {
          console.error(`[nexusai-backend] exited with code ${code}`);
        }
        child = null;
      });
      console.log(`[nexusai-backend] starting on http://localhost:${BACKEND_PORT}…`);
    },

    buildEnd() {
      // keep running between rebuilds
    },

    closeBundle() {
      // production builds: nothing to clean
    },
  };
}
