import { Router } from "express";
import { Role } from "core/constants/role.ts";
import {
  updateTicketSchema,
  ticketListQuerySchema,
  type TicketDetail,
  type TicketListItem,
  type TicketListResponse,
  type TicketSortField,
} from "core/schemas/tickets.ts";

import prisma from "../db";
import type { Prisma } from "../generated/prisma/client";
import { validate } from "../lib/validate";

export const ticketsRouter = Router();

// The assignee relation is embedded in every ticket payload; select just the
// identity fields (never auth-sensitive columns) so the shape matches
// TicketAssignee and the list/detail/patch responses stay consistent.
const assigneeSelect = { select: { id: true, name: true } } as const;

// Columns returned by the detail (GET /:id) and assign (PATCH /:id) endpoints —
// shared so both produce the exact same TicketDetail shape.
const detailSelect = {
  id: true,
  subject: true,
  body: true,
  requesterEmail: true,
  requesterName: true,
  status: true,
  category: true,
  createdAt: true,
  updatedAt: true,
  assignee: assigneeSelect,
} as const;

// Serializes a Prisma ticket row (selected via `detailSelect`) into the JSON
// detail shape — the two Date columns become ISO strings. Typing the param with
// the payload of `detailSelect` keeps the mapping honest without a cast.
function toTicketDetail(
  ticket: Prisma.TicketGetPayload<{ select: typeof detailSelect }>,
): TicketDetail {
  return {
    ...ticket,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

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
        assignee: assigneeSelect,
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

// Single ticket detail. Ids are opaque string UUIDs (not numeric), so there's no
// parseId step — an unknown id simply misses and 404s. Returns the full record,
// including the message body and updatedAt, on top of the list fields.
ticketsRouter.get("/:id", async (req, res) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    select: detailSelect,
  });

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  res.json(toTicketDetail(ticket));
});

// Partial update of an agent-editable ticket: status, category, and/or assignee.
// Available to any authenticated user (the parent apiRouter applies requireAuth)
// so agents can work their tickets — EXCEPT assignment, which stays admin-only
// via a field-level check below. A non-null assigneeId must reference an active
// (non-deleted) user; anything else is a 400 so we never point a ticket at a
// missing/disabled account. Returns the updated ticket in the same shape as
// GET /:id.
ticketsRouter.patch("/:id", async (req, res) => {
  const data = validate(updateTicketSchema, req.body, res);
  if (!data) return;

  const { id } = req.params;

  // Assignment is admin-only: reject a non-admin that tries to (re)assign, even
  // though status/category edits are open to agents.
  const changingAssignee = data.assigneeId !== undefined;
  if (changingAssignee && req.user?.role !== Role.admin) {
    res.status(403).json({ error: "Only admins can assign tickets" });
    return;
  }

  const existing = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // Validate a concrete assignee (null clears the assignment and needs no check).
  if (data.assigneeId != null) {
    const agent = await prisma.user.findFirst({
      where: { id: data.assigneeId, deletedAt: null },
      select: { id: true },
    });
    if (!agent) {
      res.status(400).json({ error: "Assignee is not a valid agent" });
      return;
    }
  }

  // Only write the fields that were actually provided, so an omitted field is
  // left unchanged (rather than nulled).
  const ticket = await prisma.ticket.update({
    where: { id },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(changingAssignee ? { assigneeId: data.assigneeId } : {}),
    },
    select: detailSelect,
  });

  res.json(toTicketDetail(ticket));
});
