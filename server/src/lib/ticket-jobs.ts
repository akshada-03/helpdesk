import type { PgBoss } from "pg-boss";

import { classifyTicketById } from "./classify";
import { autoResolveTicketById } from "./auto-resolve";
import { sendTicketReplyEmailById } from "./reply-email";
import { enqueue } from "./queue";

// The ticket background jobs: their queue names, retry policy, worker handlers, and
// the enqueue helpers the inbound-email webhook calls. The pg-boss instance and its
// lifecycle live in ./queue; this module only describes the work. startQueue() drives
// registerTicketJobs() once the boss is up, and the send* helpers enqueue through
// ./queue's never-throw `enqueue`. Keeping each job's config, worker, and send helper
// together means a new ticket job is added in one place.

const CLASSIFY_TICKET_QUEUE = "classify-ticket";
const AUTO_RESOLVE_TICKET_QUEUE = "auto-resolve-ticket";
const SEND_REPLY_EMAIL_QUEUE = "send-ticket-reply-email";

type ClassifyTicketJob = { ticketId: number };
type AutoResolveTicketJob = { ticketId: number };
type SendReplyEmailJob = { replyId: number };

// Shared by both ticket queues: a few retries with exponential backoff so a transient
// model/network blip doesn't permanently drop the work; once they're exhausted pg-boss
// stops retrying.
const RETRY_POLICY = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
} as const;

// Creates the ticket queues and registers their workers on an already-started boss.
// Called from startQueue(). Default batch size is 1, so each handler gets a
// single-element array.
export async function registerTicketJobs(boss: PgBoss): Promise<void> {
  // classify-ticket: auto-categorize an inbound ticket. After retries are exhausted
  // the ticket stays uncategorized until an agent sets it.
  await boss.createQueue(CLASSIFY_TICKET_QUEUE, RETRY_POLICY);
  await boss.work<ClassifyTicketJob>(CLASSIFY_TICKET_QUEUE, async ([job]) => {
    await classifyTicketById(job.data.ticketId);
  });

  // auto-resolve-ticket: try to answer an inbound ticket from the knowledge base and
  // resolve it without a human. The worker only rethrows on infrastructure failures —
  // an AI failure degrades to "hand it to an agent" inside the worker rather than
  // burning retries (see lib/auto-resolve).
  await boss.createQueue(AUTO_RESOLVE_TICKET_QUEUE, RETRY_POLICY);
  await boss.work<AutoResolveTicketJob>(
    AUTO_RESOLVE_TICKET_QUEUE,
    async ([job]) => {
      await autoResolveTicketById(job.data.ticketId);
    },
  );

  // send-ticket-reply-email: email a support reply to the ticket's requester. The
  // handler throws on an SMTP failure so the retry policy applies; a persistent
  // failure gives up with the reply still saved (see lib/reply-email).
  await boss.createQueue(SEND_REPLY_EMAIL_QUEUE, RETRY_POLICY);
  await boss.work<SendReplyEmailJob>(SEND_REPLY_EMAIL_QUEUE, async ([job]) => {
    await sendTicketReplyEmailById(job.data.replyId);
  });
}

// Enqueues a ticket for background classification. Durable and never-throwing (see
// ./queue's `enqueue`): a failure to enqueue is logged, not propagated, so the
// inbound-email webhook still acknowledges the message — a lost classification is the
// lesser evil versus a redelivered, duplicated ticket. No-ops when the queue isn't
// running (the ticket just stays uncategorized).
export async function sendClassifyTicketJob(ticketId: number): Promise<void> {
  await enqueue(CLASSIFY_TICKET_QUEUE, { ticketId } satisfies ClassifyTicketJob);
}

// Enqueues a ticket for background auto-resolution. Same durability and never-throw
// contract as sendClassifyTicketJob. If this no-ops (queue not running) or fails, the
// ticket simply stays `new` until an agent works it — no auto-reply, but nothing lost.
export async function sendAutoResolveTicketJob(ticketId: number): Promise<void> {
  await enqueue(AUTO_RESOLVE_TICKET_QUEUE, {
    ticketId,
  } satisfies AutoResolveTicketJob);
}

// Enqueues a support reply to be emailed to the ticket's requester. Same durability
// and never-throw contract as the other send helpers. Safe to call unconditionally:
// the worker no-ops when email isn't configured, and only agent-side replies are
// actually sent (see lib/reply-email).
export async function sendReplyEmailJob(replyId: number): Promise<void> {
  await enqueue(SEND_REPLY_EMAIL_QUEUE, { replyId } satisfies SendReplyEmailJob);
}
