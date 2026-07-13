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

  // Optional filters. An omitted param leaves the field off `where` entirely, so
  // it isn't constrained (matches all values). `search` is a case-insensitive
  // substring match across the subject, requester name/email, and body.
  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.search
      ? {
          OR: [
            { subject: { contains: query.search, mode: "insensitive" as const } },
            {
              requesterName: {
                contains: query.search,
                mode: "insensitive" as const,
              },
            },
            {
              requesterEmail: {
                contains: query.search,
                mode: "insensitive" as const,
              },
            },
            { body: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  // Page the results and count the full (filtered) set in one round trip so the
  // total stays consistent with the rows returned.
  const [tickets, total] = await prisma.$transaction([
    prisma.ticket.findMany({
      where,
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
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);

  const body: TicketListResponse = {
    tickets: tickets.map(
      (ticket): TicketListItem => ({
        ...ticket,
        createdAt: ticket.createdAt.toISOString(),
      }),
    ),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
  res.json(body);
});
