import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

import {
  IMAP_HOST,
  IMAP_PASS,
  IMAP_POLL_SECONDS,
  IMAP_PORT,
  IMAP_SECURE,
  IMAP_USER,
} from "./env";
import { intakeEmailTicket } from "./ticket-intake";

// Inbound email over IMAP: poll a mailbox and turn each new message into a ticket.
// This is the self-hosted alternative to the SendGrid webhook — point it at any IMAP
// account (a free Gmail with an App Password works) and every unread email becomes a
// ticket. Both paths funnel through intakeEmailTicket, so a ticket is created the same
// way regardless of how the mail arrived.
//
// Optional, like AI and SMTP: with the IMAP_* env unset the poller never starts and
// the app runs on the webhook alone. Guarded on host + login so a half-configured
// server doesn't try (and repeatedly fail) to connect.

export function isImapConfigured(): boolean {
  return Boolean(IMAP_HOST && IMAP_USER && IMAP_PASS);
}

// Defensive upper bounds on the body we ingest from a mailbox we control. Real emails
// routinely exceed the webhook schema's tight caps, so we don't validate against it;
// we just slice to keep a pathological message from flooding the DB and the AI
// classifier. Generous enough that normal mail is untouched.
const MAX_TEXT = 100_000;
const MAX_HTML = 200_000;

// Connects, processes every UNSEEN message in INBOX, marks each \Seen, and logs out.
// A fresh connection per cycle (rather than a long-lived one) keeps this simple and
// sidesteps stale-socket handling — fine at helpdesk polling volumes.
//
// Ordering is deliberate: we create the ticket first, then mark the message \Seen. If
// the process dies before we mark it read, the message is reprocessed next cycle and
// makes a duplicate ticket — the lesser evil versus marking it read first and losing
// the ticket entirely on a crash.
//
// The work is split into three phases on purpose. The earlier version created each
// ticket *inside* the `for await` over the fetch stream, which left the IMAP fetch
// command in flight and idle for the whole (DB + AI) create — long enough that Gmail
// timed the socket out mid-batch, so a cycle only ever ingested one message. Instead:
//   1. drain every unseen message's raw source into memory (tight, back-to-back reads);
//   2. create a ticket per message — pure DB/queue work, no IMAP command pending;
//   3. mark the ones we ingested \Seen in a single batch.
// So no IMAP command is ever left waiting while slow work runs.
async function pollOnce(): Promise<void> {
  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS) return;

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT ? Number(IMAP_PORT) : 993,
    // Implicit TLS by default (port 993). Only disabled if explicitly set to "false".
    secure: IMAP_SECURE !== "false",
    auth: { user: IMAP_USER, pass: IMAP_PASS },
    // Give a command a generous window before the socket is considered dead — the
    // three-phase split keeps commands short, but a slow network shouldn't kill a poll.
    socketTimeout: 90_000,
    // imapflow logs verbosely at info level by default; quiet it.
    logger: false,
  });

  // ImapFlow is an EventEmitter, and a socket-level failure (timeout, dropped
  // connection) is emitted as an async 'error' event. Without a listener, Node/Bun
  // treats that as an unhandled error and crashes the process — the try/catch in
  // tick() can't catch it because it isn't a rejected promise. Log and let this
  // cycle's connection tear down; the next tick reconnects. (Same guard pg-boss
  // gets in lib/queue.)
  client.on("error", (error) => {
    console.error("IMAP client error:", error);
  });

  await client.connect();
  try {
    // Phase 1 — drain all unseen sources fast. source: true fetches the raw RFC822
    // message via BODY.PEEK, so fetching does NOT mark anything \Seen; we do that
    // ourselves in phase 3, only for messages we actually turned into tickets.
    const fetched: { uid: number; source: Buffer }[] = [];
    const lock = await client.getMailboxLock("INBOX");
    try {
      for await (const msg of client.fetch(
        { seen: false },
        { uid: true, source: true },
      )) {
        if (msg.source) fetched.push({ uid: msg.uid, source: msg.source });
      }
    } finally {
      lock.release();
    }

    if (fetched.length === 0) return;

    // Phase 2 — create a ticket per message. No IMAP command is in flight here, so a
    // slow create can't idle-timeout the connection. A per-message try/catch keeps one
    // malformed email from dropping the rest; a message that *throws* is left UNSEEN
    // (not added to ingestedUids) and retried next cycle. A message intake returns
    // without throwing — whether it made a ticket or was intentionally dropped for
    // having no valid sender — counts as handled and is marked read below.
    const ingestedUids: number[] = [];
    for (const msg of fetched) {
      try {
        const parsed = await simpleParser(msg.source);
        await intakeEmailTicket({
          // parseFrom (in lib/inbound-email) handles both "Name <addr>" and a bare
          // address, so the full From header text is the right thing to pass.
          from: parsed.from?.text ?? "",
          subject: parsed.subject ?? "",
          text: (parsed.text ?? "").slice(0, MAX_TEXT),
          html: (typeof parsed.html === "string" ? parsed.html : "").slice(
            0,
            MAX_HTML,
          ),
          // Threading headers: let intake route a reply back to its ticket (via the
          // References anchor we set on outbound mail) and record this message's
          // Message-ID as a new ticket's thread root. mailparser hands back References
          // as a string or an array (multi-line header) — normalise to one string.
          messageId: parsed.messageId ?? undefined,
          inReplyTo: parsed.inReplyTo ?? undefined,
          references: Array.isArray(parsed.references)
            ? parsed.references.join(" ")
            : parsed.references ?? undefined,
        });
        ingestedUids.push(msg.uid);
      } catch (error) {
        console.error(`Failed to ingest inbound email (uid ${msg.uid}):`, error);
      }
    }

    // Phase 3 — mark everything we ingested \Seen in one command so it isn't
    // re-processed. Only the successfully-ticketed uids, so a failed intake stays
    // unread for the next cycle.
    if (ingestedUids.length > 0) {
      const flagLock = await client.getMailboxLock("INBOX");
      try {
        await client.messageFlagsAdd(ingestedUids, ["\\Seen"], { uid: true });
      } finally {
        flagLock.release();
      }
    }
  } finally {
    // A clean logout is best-effort: if the socket already died (timeout mid-poll),
    // logout() itself throws. Swallow it so it can't mask a real error or escape the
    // finally — the connection is going away regardless.
    try {
      await client.logout();
    } catch {
      // Already disconnected — nothing to do.
    }
  }
}

let timer: NodeJS.Timeout | null = null;
let polling = false;

// Runs a poll cycle unless one is already in flight (a slow cycle must not overlap the
// next tick and double-process). Connection-level errors are logged, not thrown, so a
// transient IMAP outage just skips a cycle instead of crashing the process.
async function tick(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    await pollOnce();
  } catch (error) {
    console.error("Inbound email poll failed:", error);
  } finally {
    polling = false;
  }
}

// Starts the inbound-email poller. Called from boot() after the queue is up (intake
// enqueues classify/auto-resolve jobs). No-ops when IMAP isn't configured, so boot
// can always call it. Polls once immediately, then on the configured interval.
export function startInboundEmailPolling(): void {
  if (!isImapConfigured()) return;
  if (timer) return; // Already started — don't stack intervals.

  const seconds = IMAP_POLL_SECONDS ? Number(IMAP_POLL_SECONDS) : 60;
  const intervalMs = Math.max(10, seconds) * 1000;

  console.log(
    `Inbound email polling enabled (every ${intervalMs / 1000}s via IMAP).`,
  );
  void tick();
  timer = setInterval(() => void tick(), intervalMs);
  // Don't let the poll timer keep the event loop alive on shutdown.
  timer.unref?.();
}

// Stops the poller. Called on graceful shutdown alongside stopQueue().
export function stopInboundEmailPolling(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
