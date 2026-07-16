import { PgBoss } from "pg-boss";

import { classifyTicketById } from "./classify";

// pg-boss job queue. It's Postgres-backed (managing its own `pgboss` schema, created
// on start — no Prisma migration needed), so background work survives a process
// restart: a job enqueued here is a committed row, not an in-memory promise that a
// crash would drop.
//
// The instance is created in startQueue and held in this module. Everything that
// enqueues goes through the exported send* helpers, which no-op safely if the queue
// was never started (e.g. in unit tests, or a boot that failed before this point).

const CLASSIFY_TICKET_QUEUE = "classify-ticket";

type ClassifyTicketJob = { ticketId: number };

let boss: PgBoss | null = null;

// Starts pg-boss and registers the workers. Called once from boot() before the
// server begins listening. Not idempotent — a second call would leak a second
// instance, so callers must invoke it exactly once.
export async function startQueue(): Promise<void> {
  // Read the connection string straight from the environment, the same way db.ts
  // feeds the Prisma adapter — the queue and the ORM must point at the same DB.
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — the job queue needs a database.");
  }

  const instance = new PgBoss(connectionString);

  // Without an error listener, pg-boss's own background errors (a dropped
  // connection, a failed maintenance query) surface as unhandled and can take the
  // process down. Log and let pg-boss recover on its own.
  instance.on("error", (error) => {
    console.error("pg-boss error:", error);
  });

  await instance.start();

  // classify-ticket: auto-categorize an inbound ticket. A few retries with
  // exponential backoff so a transient model/network blip doesn't permanently leave
  // a ticket uncategorized; after they're exhausted pg-boss stops retrying and the
  // ticket stays uncategorized until an agent sets it.
  await instance.createQueue(CLASSIFY_TICKET_QUEUE, {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
  });

  // Default batch size is 1, so the handler gets a single-element array.
  await instance.work<ClassifyTicketJob>(
    CLASSIFY_TICKET_QUEUE,
    async ([job]) => {
      await classifyTicketById(job.data.ticketId);
    },
  );

  boss = instance;
}

// Gracefully stops the queue, letting in-flight jobs finish (up to pg-boss's
// timeout). Called on SIGTERM/SIGINT. Safe to call when the queue never started.
export async function stopQueue(): Promise<void> {
  if (!boss) return;
  await boss.stop();
  boss = null;
}

// Enqueues a ticket for background classification. Durable: the job is a committed
// row before this resolves, so it survives a crash between enqueue and processing.
//
// Never throws — a failure to enqueue is logged, not propagated. Its caller is the
// inbound-email webhook, where a throw would become a non-2xx that makes the email
// provider redeliver and duplicate the ticket; a lost classification is the lesser
// evil. No-ops when the queue isn't running (the ticket just stays uncategorized).
export async function sendClassifyTicketJob(ticketId: number): Promise<void> {
  if (!boss) return;
  try {
    await boss.send(CLASSIFY_TICKET_QUEUE, { ticketId });
  } catch (error) {
    console.error(
      `Failed to enqueue classification for ticket ${ticketId}:`,
      error,
    );
  }
}
