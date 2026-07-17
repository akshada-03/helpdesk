import { PgBoss } from "pg-boss";

import { registerTicketJobs } from "./ticket-jobs";

// pg-boss job queue infrastructure. It's Postgres-backed (managing its own `pgboss`
// schema, created on start — no Prisma migration needed), so background work survives
// a process restart: a job enqueued here is a committed row, not an in-memory promise
// that a crash would drop.
//
// This module owns the pg-boss instance and its lifecycle; the ticket jobs themselves
// (queue names, workers, send helpers) live in ./ticket-jobs. Everything that enqueues
// goes through the exported `enqueue` helper, which no-ops safely if the queue was
// never started (e.g. in unit tests, or a boot that failed before this point).

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

  // The concrete ticket jobs live in ./ticket-jobs — register them now that boss is up.
  await registerTicketJobs(instance);

  boss = instance;
}

// Gracefully stops the queue, letting in-flight jobs finish (up to pg-boss's
// timeout). Called on SIGTERM/SIGINT. Safe to call when the queue never started.
export async function stopQueue(): Promise<void> {
  if (!boss) return;
  await boss.stop();
  boss = null;
}

// Generic never-throw enqueue used by the job send helpers in ./ticket-jobs. Durable:
// the job is a committed row before this resolves, so it survives a crash between
// enqueue and processing.
//
// Never throws — a failure to enqueue is logged, not propagated. The inbound-email
// webhook awaits these before responding, where a throw would become a non-2xx that
// makes the email provider redeliver and duplicate the ticket; a lost job is the
// lesser evil. No-ops when the queue isn't running.
export async function enqueue<T extends object>(
  queueName: string,
  data: T,
): Promise<void> {
  if (!boss) return;
  try {
    await boss.send(queueName, data);
  } catch (error) {
    console.error(`Failed to enqueue a job on "${queueName}":`, error);
  }
}

// Re-exported so callers keep importing the enqueue API from "./queue" — the send
// helpers themselves live alongside their job definitions in ./ticket-jobs.
export {
  sendClassifyTicketJob,
  sendAutoResolveTicketJob,
} from "./ticket-jobs";
