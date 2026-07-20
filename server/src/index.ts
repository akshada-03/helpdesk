import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import { CLIENT_URL } from "./lib/env";
import {
  startInboundEmailPolling,
  stopInboundEmailPolling,
} from "./lib/imap";
import { startQueue, stopQueue } from "./lib/queue";
import { apiRouter } from "./routes";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors({ origin: CLIENT_URL, credentials: true }));

// Better Auth handles its own body parsing — mount BEFORE express.json().
// Express 5 requires named wildcards (bare "*" is no longer valid).
app.all("/api/auth/{*any}", toNodeHandler(auth));

app.use(express.json());

app.use("/api", apiRouter);

// 404 fallback for unknown API routes
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

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
  process.exit(1);
});
