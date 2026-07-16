import prisma from "../db";
import { classifyTicket } from "./ai";

// The work performed by the `classify-ticket` queue worker (registered in
// lib/queue): load the ticket, ask the model for a category, and store it.
//
// Throws on failure (a model error, an unrecognized category) so pg-boss records the
// attempt as failed and retries it per the queue's retry policy — the durability the
// queue exists to provide. Once the retries are exhausted the ticket simply stays
// uncategorized until an agent sets it.
export async function classifyTicketById(ticketId: number): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { subject: true, body: true },
  });
  // The ticket may have been deleted between enqueue and processing. Nothing to
  // classify — return rather than throw, so pg-boss doesn't retry a job that can
  // never succeed.
  if (!ticket) return;

  const category = await classifyTicket(ticket);

  // Scope the write to a still-unclassified ticket: an agent may have set a category
  // by hand while the job sat in the queue, and that human choice should win rather
  // than be overwritten by a slower automatic one. updateMany (not update) so a
  // no-op match is fine rather than throwing.
  await prisma.ticket.updateMany({
    where: { id: ticketId, category: null },
    data: { category },
  });
}
