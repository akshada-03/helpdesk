import { Router } from "express";
import { Role } from "core/constants/role.ts";
import {
  updateTicketSchema,
  createReplySchema,
  polishReplySchema,
  ticketListQuerySchema,
  type PolishReplyResponse,
  type SummarizeTicketResponse,
  type TicketDetail,
  type TicketListItem,
  type TicketListResponse,
  type TicketReply,
  type TicketSortField,
} from "core/schemas/tickets.ts";

import prisma from "../db";
import type { Prisma } from "../generated/prisma/client";
import { polishReply, summarizeTicket } from "../lib/ai";
import { parseId } from "../lib/parse-id";
import { validate } from "../lib/validate";

// Every `/:id` handler starts by parsing the param, so they share one message.
const TICKET_NOT_FOUND = "Ticket not found";

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
  bodyHtml: true,
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

// Columns returned for a reply — the body/timestamp plus the author identity
// (never auth-sensitive columns), matching the TicketReply shape.
const replySelect = {
  id: true,
  body: true,
  bodyHtml: true,
  senderType: true,
  createdAt: true,
  author: assigneeSelect,
} as const;

// Serializes a Prisma reply row (selected via `replySelect`) into the JSON shape —
// the Date column becomes an ISO string.
function toTicketReply(
  reply: Prisma.TicketReplyGetPayload<{ select: typeof replySelect }>,
): TicketReply {
  return { ...reply, createdAt: reply.createdAt.toISOString() };
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

// Single ticket detail. The id is an integer, so it's parsed via parseId — a
// non-numeric id can't name a ticket and 404s without hitting the DB. Returns the
// full record, including the message body and updatedAt, on top of the list fields.
ticketsRouter.get("/:id", async (req, res) => {
  const id = parseId(req.params.id, res, TICKET_NOT_FOUND);
  if (id === null) return;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: detailSelect,
  });

  if (!ticket) {
    res.status(404).json({ error: TICKET_NOT_FOUND });
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

  const id = parseId(req.params.id, res, TICKET_NOT_FOUND);
  if (id === null) return;

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

// The reply thread for a ticket, oldest first (chronological reading order).
// Available to any authenticated user (agents work the ticket). 404s if the
// ticket doesn't exist so the client can distinguish "no such ticket" from an
// empty thread.
ticketsRouter.get("/:id/replies", async (req, res) => {
  const id = parseId(req.params.id, res, TICKET_NOT_FOUND);
  if (id === null) return;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!ticket) {
    res.status(404).json({ error: TICKET_NOT_FOUND });
    return;
  }

  const replies = await prisma.ticketReply.findMany({
    where: { ticketId: id },
    select: replySelect,
    orderBy: { createdAt: "asc" },
  });

  res.json(replies.map(toTicketReply));
});

// Summarize a ticket and its conversation history for the agent working it. Takes
// no request body: the ticket id in the path is the whole input, and the message and
// thread are read server-side rather than trusted from the client.
//
// Nothing is persisted and nothing is cached — every call regenerates from the
// current thread, so the summary can't lag behind a conversation that has moved on
// (a stale summary is worse than none, since the agent would act on it).
//
// Like the polish route, this try/catches against the usual convention: a failing
// model call is an expected upstream failure (outage, rate limit, missing key), and
// letting it throw would return an HTML 500 that ErrorAlert can't read a message
// from. The ticket and thread are on screen regardless, so a clean 502 just means
// the agent reads it themselves.
ticketsRouter.post("/:id/summary", async (req, res) => {
  const id = parseId(req.params.id, res, TICKET_NOT_FOUND);
  if (id === null) return;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { subject: true, body: true, requesterName: true },
  });
  if (!ticket) {
    res.status(404).json({ error: TICKET_NOT_FOUND });
    return;
  }

  // Oldest first, matching GET /:id/replies — the summarizer is told the thread is
  // chronological, so the order it arrives in is load-bearing.
  const replies = await prisma.ticketReply.findMany({
    where: { ticketId: id },
    select: { senderType: true, body: true, author: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  let summary: string;
  try {
    summary = await summarizeTicket({
      subject: ticket.subject,
      ticketBody: ticket.body,
      requesterName: ticket.requesterName,
      replies: replies.map((reply) => ({
        senderType: reply.senderType,
        body: reply.body,
        // Null for customer replies (no app User) and for agent replies whose
        // author was since hard-deleted; the prompt labels those "Agent" alone.
        authorName: reply.author?.name ?? null,
      })),
    });
  } catch (error) {
    console.error("Failed to summarize ticket:", error);
    res.status(502).json({ error: "Could not summarize the ticket. Try again." });
    return;
  }

  const body: SummarizeTicketResponse = { summary };
  res.json(body);
});

// Rewrite an agent's draft reply via GPT and hand it back. Nothing is persisted —
// the client puts the result in the compose box for the agent to review, edit, and
// send (or discard), so this is a pure transform of the submitted draft. Available
// to any authenticated user, like the reply endpoints it sits alongside.
//
// This handler *does* try/catch, against the usual convention (see CLAUDE.md): a
// failing model call is an expected upstream failure (outage, rate limit, missing
// key), and letting it throw would hit Express's default handler and return an HTML
// 500 that ErrorAlert can't extract a message from. The agent's draft is still in
// the box, so a clean 502 lets them just send it as-is.
ticketsRouter.post("/:id/replies/polish", async (req, res) => {
  const data = validate(polishReplySchema, req.body, res);
  if (!data) return;

  const id = parseId(req.params.id, res, TICKET_NOT_FOUND);
  if (id === null) return;

  // The rewrite is grounded in the ticket, so load the message alongside the
  // existence check the other reply routes do. requesterName is nullable (inbound
  // email often carries no name) — polishReply falls back to a neutral greeting.
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { subject: true, body: true, requesterName: true },
  });
  if (!ticket) {
    res.status(404).json({ error: TICKET_NOT_FOUND });
    return;
  }

  let polished: string;
  try {
    polished = await polishReply({
      draft: data.body,
      subject: ticket.subject,
      ticketBody: ticket.body,
      requesterName: ticket.requesterName,
      // Signed with the authenticated agent, from the session — never the request
      // body, so a client can't sign a reply as someone else. requireAuth (applied
      // by the parent apiRouter) guarantees req.user is set.
      agentName: req.user!.name,
    });
  } catch (error) {
    console.error("Failed to polish reply:", error);
    res.status(502).json({ error: "Could not polish the reply. Try again." });
    return;
  }

  const body: PolishReplyResponse = { body: polished };
  res.json(body);
});

// Post a new reply to a ticket. The author is the authenticated user (from the
// session), never the request body. Returns the created reply in the same shape
// as the list endpoint.
ticketsRouter.post("/:id/replies", async (req, res) => {
  const data = validate(createReplySchema, req.body, res);
  if (!data) return;

  const id = parseId(req.params.id, res, TICKET_NOT_FOUND);
  if (id === null) return;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!ticket) {
    res.status(404).json({ error: TICKET_NOT_FOUND });
    return;
  }

  const reply = await prisma.ticketReply.create({
    data: {
      // id is an auto-incrementing integer — the DB assigns it.
      ticketId: id,
      body: data.body,
      // Posted through the authenticated agent UI, so the sender is always an
      // agent; customer replies are ingested elsewhere (e.g. inbound email).
      senderType: "agent",
      authorId: req.user?.id ?? null,
    },
    select: replySelect,
  });

  res.status(201).json(toTicketReply(reply));
});
