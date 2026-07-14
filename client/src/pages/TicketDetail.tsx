import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import type { TicketDetail as TicketDetailData } from "core/schemas/tickets.ts";
import { api } from "@/lib/api";
import Navbar from "@/components/Navbar";
import BackLink from "@/components/BackLink";
import TicketDetail from "@/components/TicketDetail";
import UpdateTicket from "@/components/UpdateTicket";
import TicketReplies from "@/components/TicketReplies";
import TicketDetailSkeleton from "@/components/TicketDetailSkeleton";
import ErrorAlert from "@/components/ErrorAlert";

// Ticket detail page, reached by clicking a subject in the ticket list. Owns its
// own query keyed on the `:id` route param; the read-only summary (TicketDetail),
// editable properties (UpdateTicket), and reply thread each render from the loaded
// ticket.
export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();

  const ticket = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () =>
      (await api.get<TicketDetailData>(`/api/tickets/${id}`)).data,
  });

  let content;
  if (ticket.isPending) {
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
