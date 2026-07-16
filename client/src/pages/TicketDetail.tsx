import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod/v4";

import type { TicketDetail as TicketDetailData } from "core/schemas/tickets.ts";
import { api } from "@/lib/api";
import Navbar from "@/components/Navbar";
import BackLink from "@/components/BackLink";
import TicketDetail from "@/components/TicketDetail";
import UpdateTicket from "@/components/UpdateTicket";
import TicketReplies from "@/components/TicketReplies";
import TicketDetailSkeleton from "@/components/TicketDetailSkeleton";
import ErrorAlert from "@/components/ErrorAlert";

// Ticket ids are integers, but a route param is always a string — anything can be
// typed into the URL bar. Parsing here keeps the rest of the page working in
// numbers, and mirrors the server's `parseId`: a non-numeric id is not a bad
// request to retry, it's simply a ticket that doesn't exist.
const ticketIdSchema = z.coerce.number().int().positive();

// Ticket detail page, reached by clicking a subject in the ticket list. Owns its
// own query keyed on the `:id` route param; the read-only summary (TicketDetail),
// editable properties (UpdateTicket), and reply thread each render from the loaded
// ticket.
export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const parsedId = ticketIdSchema.safeParse(id);
  const ticketId = parsedId.success ? parsedId.data : null;

  const ticket = useQuery({
    // The key must hold the *number*, not the raw param: AssigneeSelect and
    // TicketFieldSelect seed this cache entry with `["ticket", ticket.id]` after a
    // PATCH, and ["ticket", "103"] and ["ticket", 103] are different keys — a
    // string here would silently strand their updates in an entry nobody reads.
    queryKey: ["ticket", ticketId],
    queryFn: async () =>
      (await api.get<TicketDetailData>(`/api/tickets/${ticketId}`)).data,
    enabled: ticketId !== null,
  });

  let content;
  if (ticketId === null) {
    content = <ErrorAlert message="Ticket not found." />;
  } else if (ticket.isPending) {
    content = <TicketDetailSkeleton />;
  } else if (ticket.isError) {
    content = (
      <ErrorAlert error={ticket.error} fallback="Failed to load ticket." />
    );
  } else {
    const t = ticket.data;
    content = (
      // The message and its reply thread fill the main column; the editable
      // properties sit in a narrower sidebar on the right.
      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          <TicketDetail ticket={t} />
          <TicketReplies ticketId={t.id} />
        </div>
        <UpdateTicket ticket={t} />
      </div>
    );
  }

  return (
    <div className="min-h-svh">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <BackLink to="/tickets">Back to tickets</BackLink>

        {content}
      </main>
    </div>
  );
}
