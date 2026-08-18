// Must be imported first so Sentry can instrument modules as they load.
import "./instrument";

import path from "node:path";

import * as Sentry from "@sentry/node";
import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import { CLIENT_URL, isProduction } from "./lib/env";
import {
  startInboundEmailPolling,
  stopInboundEmailPolling,
} from "./lib/imap";
import { startQueue, stopQueue } from "./lib/queue";
import { apiRouter } from "./routes";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

// Trust Render / cloud reverse proxy headers for accurate client IP resolution
app.set("trust proxy", true);

app.use(cors({ origin: CLIENT_URL, credentials: true }));

// Better Auth handles its own body parsing — mount BEFORE express.json().
// Express 5 requires named wildcards (bare "*" is no longer valid).
app.all("/api/auth/{*any}", toNodeHandler(auth));

app.use(express.json());

app.use("/api", apiRouter);

// 404 fallback for unknown API routes. Scoped to /api so that non-API paths fall
// through to the client below instead of being answered with JSON.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// --- Client (production) ---
// In production this server also serves the built React app, so the client and
// API share an origin. That keeps the Better Auth session cookie same-site: it
// would otherwise need SameSite=None to survive a cross-origin request. In dev
// the client runs its own server (client/serve.ts) with HMR, so skip this.
if (isProduction) {
  const clientDist = path.resolve(import.meta.dirname, "../../client/dist");

  app.use(express.static(clientDist));

  // SPA fallback: any non-API, non-asset path is a client-side route, so hand
  // back index.html and let React Router resolve it. Express 5 requires named
  // wildcards — a bare "*" throws at boot.
  app.get("/{*any}", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Sentry's Express error handler — must come after all routes and before any
// other error-handling middleware. Captures errors thrown by (or forwarded from)
// route handlers, including rejected async handlers under Express 5. No-op when
// SENTRY_DSN is unset.
Sentry.setupExpressErrorHandler(app);

// Start background infrastructure before accepting traffic, then listen. The queue
// must be up first so any classification enqueued by an early inbound webhook has a
// worker to run it. A failure here is fatal — the app can't function without its DB.
async function boot() {
  await startQueue();

  // Start the inbound-email poller after the queue is up — intake enqueues the
  // classify/auto-resolve jobs, so their workers must be registered first. No-ops
  // when IMAP isn't configured.
  startInboundEmailPolling();

  const server = app.listen(PORT, () => {
    console.log(`API server listening on http://localhost:${PORT}`);
  });

  // Graceful shutdown: stop taking new connections and let in-flight jobs drain
  // before the process exits, so a deploy/restart doesn't kill a job mid-run.
  async function shutdown(signal: string) {
    console.log(`\n${signal} received — shutting down.`);
    server.close();
    stopInboundEmailPolling();
    await stopQueue();
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

boot().catch((error) => {
  console.error("Failed to start server:", error);
  Sentry.captureException(error);
  process.exit(1);
});
