import { useQuery } from "@tanstack/react-query";

import {type TicketStatus, type TicketCategory } from "core/constants/ticket.ts";
import type { TicketListResponse } from "core/schemas/tickets.ts";
import { api } from "@/lib/api";
import ErrorAlert from "@/components/ErrorAlert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Badge styling per status.
const statusVariant: Record<
  TicketStatus,
  "default" | "secondary" | "outline"
> = {
  open: "default",
  resolved: "secondary",
  closed: "outline",
};

// "general_question" → "General question"; null → "—".
function formatCategory(category: TicketCategory | null): string {
  if (!category) return "—";
  const text = category.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Shared column header — the loading skeleton and the loaded table use the same
// columns, so keep them in one place to avoid drift.
function TicketsTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Subject</TableHead>
        <TableHead>Requester</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Category</TableHead>
        <TableHead>Created</TableHead>
      </TableRow>
    </TableHeader>
  );
}

// The ticket list. Owns its own ["tickets"] query so the page stays a thin
// layout. Rows are rendered in the order the API returns them — the server sorts
// newest first (createdAt desc).
export default function TicketsTable() {
  const tickets = useQuery({
    queryKey: ["tickets"],
    queryFn: async () =>
      (await api.get<TicketListResponse>("/api/tickets")).data.tickets,
  });

  if (tickets.isPending) {
    return (
      <div className="rounded-md border">
        <Table>
          <TicketsTableHeader />
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-48" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-40" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-28" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (tickets.isError) {
    return (
      <ErrorAlert error={tickets.error} fallback="Failed to load tickets." />
    );
  }

  if (tickets.data.length === 0) {
    return (
      <span className="text-muted-foreground text-sm">No tickets yet.</span>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TicketsTableHeader />
        <TableBody>
          {tickets.data.map((ticket) => (
            <TableRow key={ticket.id}>
              <TableCell className="font-medium">{ticket.subject}</TableCell>
              <TableCell>
                <div>{ticket.requesterName ?? ticket.requesterEmail}</div>
                {ticket.requesterName && (
                  <div className="text-muted-foreground text-xs">
                    {ticket.requesterEmail}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant[ticket.status]}>
                  {ticket.status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatCategory(ticket.category)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(ticket.createdAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
