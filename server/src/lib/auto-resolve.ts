import prisma from "../db";
import { autoResolveTicket } from "./ai";
import { loadKnowledgeBase } from "./knowledge-base";

// The work performed by the `auto-resolve-ticket` queue worker (registered in
// lib/queue): on a ticket's arrival, try to answer it from the knowledge base
// alone. If the AI can, post its reply and resolve the ticket; otherwise hand it
// to an agent by opening it.
//
// The ticket is created `new` and hidden from the agent UI. This worker moves it
// to `processing` while it works (still hidden), then to a terminal, agent-visible
// status — so a ticket is never stuck invisible: every path out of `processing`
// lands on `resolved` or `open`.
//
// AI failures are deliberately NOT rethrown: auto-resolution is best-effort, and a
// model outage or a garbled response should degrade to "let an agent handle it",
// not leave the ticket wedged in `processing` waiting on retries. Infrastructure
// failures (a DB write) still throw, so pg-boss retries those per the queue policy.
export async function autoResolveTicketById(ticketId: number): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      subject: true,
      body: true,
      requesterName: true,
      status: true,
    },
  });
  // Deleted between enqueue and processing — nothing to do.
  if (!ticket) return;

  // Only act on a ticket still in the intake pipeline. If it already reached a
  // terminal status (an agent picked it up, or a prior run finished), leave it —
  // this makes the worker idempotent across retries/duplicate deliveries.
  if (ticket.status !== "new" && ticket.status !== "processing") return;

  // Mark it in-flight (still hidden from agents). Scoped to the pre-terminal
  // statuses so a concurrent transition can't be clobbered.
  await prisma.ticket.updateMany({
    where: { id: ticketId, status: { in: ["new", "processing"] } },
    data: { status: "processing" },
  });

  let result: Awaited<ReturnType<typeof autoResolveTicket>>;
  try {
    result = await autoResolveTicket({
      subject: ticket.subject,
      body: ticket.body,
      requesterName: ticket.requesterName,
      knowledgeBase: loadKnowledgeBase(),
    });
  } catch (error) {
    // generateText threw — a model outage, an unparseable response, or a missing
    // knowledge-base file. Hand the ticket to an agent by opening it rather than
    // retrying indefinitely (scoped to `processing` so a concurrent transition
    // can't be clobbered).
    console.error(
      `Auto-resolve failed for ticket ${ticketId}; opening it for an agent:`,
      error,
    );
    await prisma.ticket.updateMany({
      where: { id: ticketId, status: "processing" },
      data: { status: "open" },
    });
    return;
  }

  if (!result.resolved) {
    await prisma.ticket.updateMany({
      where: { id: ticketId, status: "processing" },
      data: { status: "open" },
    });
    return;
  }

  // Resolve first, scoped to `processing`, so a re-run (or an agent who grabbed the
  // ticket in the meantime) can't cause a duplicate auto-reply: the reply is only
  // posted when this run actually performed the resolution.
  const resolved = await prisma.ticket.updateMany({
    where: { id: ticketId, status: "processing" },
    data: { status: "resolved" },
  });
  if (resolved.count === 0) return;

  await prisma.ticketReply.create({
    data: {
      ticketId,
      body: result.reply,
      // The auto-reply is the support side answering the customer, so it's an
      // agent-type reply — but with no authoring User (it's the system).
      senderType: "agent",
      authorId: null,
    },
  });
}
