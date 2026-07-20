import prisma from "../db";
import { isEmailConfigured, replySubject, sendEmail } from "./email";
import { API_BASE_URL } from "./env";

// The work performed by the `send-ticket-reply-email` queue worker: email a reply to
// the ticket's requester. Enqueued whenever a support-side reply is created — an agent
// posting from the UI (routes/tickets) or the AI auto-resolver (lib/auto-resolve).
//
// No-ops when email isn't configured, so callers can always enqueue without checking:
// on a server with no SMTP the reply is still saved and shown in the UI, it just isn't
// mailed out. Only agent-side replies go out — a `customer` reply is inbound mail we
// ingested, and echoing it back to the sender would be a loop.
//
// Throws on an SMTP failure so pg-boss retries per the queue policy; a persistent
// failure exhausts the retries and gives up (the reply is already persisted).
export async function sendTicketReplyEmailById(replyId: number): Promise<void> {
  if (!isEmailConfigured()) return;

  const reply = await prisma.ticketReply.findUnique({
    where: { id: replyId },
    select: {
      body: true,
      senderType: true,
      ticket: {
        select: {
          id: true,
          subject: true,
          requesterEmail: true,
          messageId: true,
        },
      },
    },
  });

  // Deleted between enqueue and processing, or (defensively) an inbound customer
  // reply that should never be echoed back out — nothing to send either way.
  if (!reply || reply.senderType !== "agent") return;

  const { ticket } = reply;

  // Threading. Two anchors go into References:
  //   - the original inbound email's Message-ID (when we captured one), so the client
  //     threads this reply directly under the customer's own message;
  //   - a synthetic `<ticket-{id}@host>` id that every mail on this ticket shares, so
  //     the customer's reply carries it back and intake can route the reply to this
  //     ticket even if the original Message-ID was absent.
  // In-Reply-To points at the original message when known (best client threading),
  // else the synthetic anchor. The host half is only there to form a syntactically
  // valid id; nothing routes to it.
  const host = new URL(API_BASE_URL).hostname;
  const anchor = `<ticket-${ticket.id}@${host}>`;
  const references = [ticket.messageId, anchor].filter(Boolean).join(" ");

  await sendEmail({
    to: ticket.requesterEmail,
    subject: replySubject(ticket.subject),
    text: reply.body,
    inReplyTo: ticket.messageId ?? anchor,
    references,
  });
}
