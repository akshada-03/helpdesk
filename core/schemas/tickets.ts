import { z } from "zod/v4";

import type { TicketCategory, TicketStatus } from "../constants/ticket.ts";

// Columns the ticket list may be sorted by. Each id doubles as the Prisma field
// name, so this allowlist is what keeps arbitrary columns out of `orderBy`.
export const ticketSortFields = [
  "subject",
  "requesterName",
  "status",
  "category",
  "createdAt",
] as const;
export type TicketSortField = (typeof ticketSortFields)[number];

// Query params for GET /api/tickets. Shared so the client builds the request and
// the server validates it against the same allowlist. Defaults reproduce the
// original behaviour (newest first) when no params are supplied.
export const ticketListQuerySchema = z.object({
  sortBy: z.enum(ticketSortFields).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});
export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;

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
