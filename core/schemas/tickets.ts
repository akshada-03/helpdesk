import type { TicketCategory, TicketStatus } from "../constants/ticket.ts";

// Shape of a ticket as returned by GET /api/tickets. `createdAt` is serialized to
// an ISO string over JSON. `category` is null until AI classification runs.
export type TicketListItem = {
  id: string;
  subject: string;
  requesterEmail: string;
  requesterName: string | null;
  status: TicketStatus;
  category: TicketCategory | null;
  createdAt: string;
};

export type TicketListResponse = {
  tickets: TicketListItem[];
};
