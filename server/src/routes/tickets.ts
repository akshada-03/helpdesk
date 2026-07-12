import { Router } from "express";
import {
  ticketListQuerySchema,
  type TicketListItem,
  type TicketListResponse,
  type TicketSortField,
} from "core/schemas/tickets.ts";

import prisma from "../db";
import { validate } from "../lib/validate";

export const ticketsRouter = Router();

// Ticket list for agents/admins. requireAuth is applied by the parent apiRouter,
// so any authenticated user may read tickets (both roles handle them). Sorting is
// server-side: sortBy/order come from the query string and are validated against a
// shared allowlist so only known columns reach Prisma. Defaults to newest first.
// Sortable columns that can hold NULLs — for these we force nulls last so the
// ordering is stable regardless of direction. Required columns take the plain
// form (Prisma only accepts the { sort, nulls } object form on nullable fields).
const nullableSortFields = new Set<TicketSortField>([
  "category",
  "requesterName",
]);

ticketsRouter.get("/", async (req, res) => {
  const query = validate(ticketListQuerySchema, req.query, res);
  if (!query) return;

  const orderBy = nullableSortFields.has(query.sortBy)
    ? { [query.sortBy]: { sort: query.order, nulls: "last" as const } }
    : { [query.sortBy]: query.order };

  const tickets = await prisma.ticket.findMany({
    select: {
      id: true,
      subject: true,
      requesterEmail: true,
      requesterName: true,
      status: true,
      category: true,
      createdAt: true,
    },
    orderBy,
  });

  const body: TicketListResponse = {
    tickets: tickets.map(
      (ticket): TicketListItem => ({
        ...ticket,
        createdAt: ticket.createdAt.toISOString(),
      }),
    ),
  };
  res.json(body);
});
