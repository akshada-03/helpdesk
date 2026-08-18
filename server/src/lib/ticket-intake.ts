import { z } from "zod/v4";

import prisma from "../db";
import { AI_AGENT_ID } from "./ai-agent";
import { isAiConfigured } from "./ai";
import { sendAutoResolveTicketJob, sendClassifyTicketJob } from "./queue";
import {
  ticketFromInboundEmail,
  type InboundEmail,
} from "./inbound-email";

// A ticket always has a sender email — replies are emailed back to it, so a ticket
// with no (or a malformed) requester address is unanswerable. This is the one guard
// that enforces the invariant for every inbound path.
const senderEmailSchema = z.string().email();

// Flattens In-Reply-To + References into one searchable string. The IMAP poller joins
// a multi-value References header into one string before it reaches here, so both
// fields are plain strings.
function headerBlob(data: InboundEmail): string {
  return `${data.inReplyTo ?? ""} ${data.references ?? ""}`;
}

// Finds the ticket an inbound email is a reply to, or null if it's a fresh message.
// Two signals, in order of trust:
//   1. the `<ticket-{id}@host>` anchor our own outbound replies embed in References —
//      a direct id, so a reply to anything we sent routes home;
//   2. failing that, any Message-ID referenced in the headers that matches a ticket's
//      stored thread root — covers a customer replying to their own original message
//      before we've answered.
async function findRepliedTicket(
  data: InboundEmail,
): Promise<{ id: number; status: string } | null> {
  const blob = headerBlob(data);

  const anchor = blob.match(/ticket-(\d+)@/);
  if (anchor) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: Number(anchor[1]) },
      select: { id: true, status: true },
    });
    if (ticket) return ticket;
  }

  const messageIds = [...blob.matchAll(/<[^>]+>/g)].map((m) => m[0]);
  if (messageIds.length > 0) {
    const ticket = await prisma.ticket.findFirst({
      where: { messageId: { in: messageIds } },
      select: { id: true, status: true },
    });
    if (ticket) return ticket;
  }

  return null;
}

// Creates a ticket from a parsed inbound email and kicks off the AI intake pipeline —
// OR, when the email is a reply to an existing ticket, appends it to that ticket's
// thread instead of opening a new one. Shared by every inbound path (the SendGrid
// webhook and the IMAP poller) so mail enters the system identically regardless of how
// it arrived.
//
// Returns the affected ticket's id, or null when the message had no valid sender
// address and was dropped (callers treat null as "handled, nothing to create" — the
// webhook still acknowledges it and the poller still marks it read, so a sender-less
// message isn't retried forever).
export async function intakeEmailTicket(
  data: InboundEmail,
): Promise<{ id: number } | null> {
  const fields = ticketFromInboundEmail(data);

  // Enforce the invariant: every ticket has a usable sender email. If the message
  // carried none (or an unparseable From), drop it rather than persist a ticket no
  // one can reply to.
  if (!senderEmailSchema.safeParse(fields.requesterEmail).success) {
    console.warn(
      `Dropping inbound email with no valid sender address: ${JSON.stringify(
        fields.requesterEmail,
      )} (subject: ${JSON.stringify(fields.subject)})`,
    );
    return null;
  }

  // If this is a reply to an existing ticket, append it to that thread as a customer
  // reply rather than creating a duplicate ticket. No AI pipeline runs — classify /
  // auto-resolve are for the opening message, not follow-ups.
  const replied = await findRepliedTicket(data);
  if (replied) {
    await prisma.ticketReply.create({
      data: {
        ticketId: replied.id,
        body: fields.body,
        bodyHtml: fields.bodyHtml,
        // Ingested from the customer's email, so it's a customer-side reply with no
        // authoring app User.
        senderType: "customer",
        authorId: null,
      },
    });

    // A follow-up on a finished ticket means the customer isn't done — reopen it and
    // return it to the unassigned queue so an agent picks it back up. Also update
    // messageId to the customer's latest message ID so future replies thread under it.
    const isTerminal =
      replied.status === "resolved" || replied.status === "closed";
    const updateData: {
      status?: "open";
      assigneeId?: null;
      messageId?: string;
    } = {};
    if (isTerminal) {
      updateData.status = "open";
      updateData.assigneeId = null;
    }
    if (data.messageId) {
      updateData.messageId = data.messageId;
    }
    if (Object.keys(updateData).length > 0) {
      await prisma.ticket.update({
        where: { id: replied.id },
        data: updateData,
      });
    }

    return { id: replied.id };
  }

  // When AI is on, the ticket enters the pipeline as `new` — hidden from agents while
  // the auto-resolve worker tries to answer it, then moved to a terminal status by
  // that worker. With AI off there's no pipeline, so it starts `open` (the column
  // default) and is immediately visible to agents.
  const aiConfigured = isAiConfigured();

  const ticket = await prisma.ticket.create({
    data: {
      // id is an auto-incrementing integer — the DB assigns it. `fields` (with the
      // now-validated requesterEmail) was derived above.
      ...fields,
      // Store this email's Message-ID as the ticket's thread root, so outbound replies
      // can thread under it in the customer's mail client and future replies match back.
      messageId: data.messageId ?? null,
      // category is left null until AI classification runs.
      // When AI is on, the ticket enters the pipeline as `new` and is assigned to the
      // AI agent, which owns it while auto-resolution runs. The worker keeps that
      // assignment if it resolves the ticket, or clears it when handing off to a human.
      ...(aiConfigured
        ? { status: "new" as const, assigneeId: AI_AGENT_ID }
        : {}),
    },
  });

  // Enqueue the background intake jobs, but only when AI is configured — an
  // unconfigured server would otherwise queue jobs that can only fail (and would
  // strand the ticket in `new`). Enqueuing never throws (see the send* helpers), so
  // the intake completes even if the queue is down.
  if (aiConfigured) {
    await sendClassifyTicketJob(ticket.id);
    await sendAutoResolveTicketJob(ticket.id);
  }

  return { id: ticket.id };
}
