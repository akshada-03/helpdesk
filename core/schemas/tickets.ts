import { z } from "zod/v4";

import {
  agentTicketStatuses,
  ticketCategories,
  type ReplySenderType,
  type TicketCategory,
  type TicketStatus,
} from "../constants/ticket.ts";

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
// original behaviour (newest first) when no params are supplied. `status` and
// `category` are optional filters — omitting a param means "no filter on that
// field" (all values), so the enums are `.optional()` with no default. `search`
// is a free-text term matched (case-insensitively) against the subject, requester
// name/email, and body; it's trimmed and a blank term is normalised to undefined
// so an empty box is treated as "no search".
export const ticketListQuerySchema = z.object({
  sortBy: z.enum(ticketSortFields).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  // Only agent-visible statuses are filterable — the endpoint never surfaces
  // `new`/`processing` regardless, so accepting them here would be misleading.
  status: z.enum(agentTicketStatuses).optional(),
  category: z.enum(ticketCategories).optional(),
  search: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined)),
  // Pagination. Params arrive as strings on the query string, so coerce to
  // numbers; `pageSize` is capped so a client can't request an unbounded page.
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;

// The assigned agent as embedded in ticket payloads — just the identity needed to
// render the assignee (never auth-sensitive fields). Null when unassigned.
export type TicketAssignee = {
  id: string;
  name: string;
};

// Shape of a ticket as returned by GET /api/tickets. `createdAt` is serialized to
// an ISO string over JSON. `category` is null until AI classification runs.
// `assignee` is null until an agent is assigned.
export type TicketListItem = {
  // Auto-incrementing integer assigned by the database — this is the ticket number
  // agents refer to. Note it is NOT a string: it goes into URLs (/tickets/12) and
  // comes back off the wire as a JSON number, so client code that reads it from a
  // route param must parse it.
  id: number;
  subject: string;
  requesterEmail: string;
  requesterName: string | null;
  status: TicketStatus;
  category: TicketCategory | null;
  createdAt: string;
  assignee: TicketAssignee | null;
};

// The current page of tickets plus the metadata the client needs to render
// pagination controls. `total` is the count across all pages for the active
// filters (not just this page), so the client can derive the page count.
export type TicketListResponse = {
  tickets: TicketListItem[];
  total: number;
  page: number;
  pageSize: number;
};

// Full ticket as returned by GET /api/tickets/:id — the list fields plus the
// message `body` and `updatedAt`. Both dates are serialized to ISO strings over
// JSON. `category` is null until AI classification runs; `assignee` is null until
// an agent is assigned. `bodyHtml` is the original HTML email body (null for text-
// only emails); it is untrusted markup and must be DOMPurify-sanitized before the
// client renders it.
export type TicketDetail = {
  // See TicketListItem.id — an integer ticket number, not a string.
  id: number;
  subject: string;
  body: string;
  bodyHtml: string | null;
  requesterEmail: string;
  requesterName: string | null;
  status: TicketStatus;
  category: TicketCategory | null;
  createdAt: string;
  updatedAt: string;
  assignee: TicketAssignee | null;
};

// Request body for PATCH /api/tickets/:id — a partial update of any subset of the
// agent-editable fields. Every field is optional, so a caller sends only what it
// changes (e.g. just `{ status }` or just `{ assigneeId }`). `category` may be set
// to null (uncategorized); `assigneeId` may be null (unassigned) and, when a
// string, is validated for existence/eligibility on the server. At least one
// field must be present. Assignment is admin-only — enforced in the route, not
// here, since this schema is shared with the client.
export const updateTicketSchema = z
  .object({
    // Agents may only move a ticket between the agent-visible statuses; the
    // AI pipeline owns the `new`/`processing` transitions.
    status: z.enum(agentTicketStatuses).optional(),
    category: z.enum(ticketCategories).nullable().optional(),
    assigneeId: z.string().min(1).nullable().optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    message: "No fields to update",
  });
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

// The reply author as embedded in reply payloads — just the identity needed to
// render who wrote it (never auth-sensitive fields). Null when the author's
// account has since been hard-deleted (the reply is kept regardless).
export type ReplyAuthor = {
  id: string;
  name: string;
};

// A single reply in a ticket's thread, as returned by GET /api/tickets/:id/replies
// and POST /api/tickets/:id/replies. `createdAt` is serialized to an ISO string
// over JSON. `author` is null when the authoring user has been hard-deleted.
export type TicketReply = {
  // Auto-incrementing integer PK, like the ticket's own id. Only unique across
  // replies, not scoped per ticket.
  id: number;
  body: string;
  // Original HTML body when the reply carried an HTML part (customer replies from
  // email); null for plain-text agent replies. Untrusted markup — DOMPurify-
  // sanitize before rendering, exactly like TicketDetail.bodyHtml.
  bodyHtml: string | null;
  // Whether an agent or the customer (requester) wrote this reply.
  senderType: ReplySenderType;
  createdAt: string;
  author: ReplyAuthor | null;
};

// Request body for POST /api/tickets/:id/replies — a new reply on the thread. The
// body is trimmed and must be non-empty; the author is taken from the session, not
// the request. Shared so the client form and the server validate the same rules.
export const createReplySchema = z.object({
  body: z.string().trim().min(1, "Reply cannot be empty").max(10000),
});
export type CreateReplyInput = z.infer<typeof createReplySchema>;

// Request body for POST /api/tickets/:id/replies/polish — the agent's draft, which
// the server rewrites via GPT. Mirrors createReplySchema's limits: the draft is the
// same text that would be sent, so the same bounds apply (and the polished result
// must stay postable).
export const polishReplySchema = z.object({
  body: z.string().trim().min(1, "Nothing to polish").max(10000),
});
export type PolishReplyInput = z.infer<typeof polishReplySchema>;

// Response from POST /api/tickets/:id/replies/polish — the rewritten draft. Nothing
// is persisted; the client drops this into the compose box for the agent to review
// and edit before sending.
export type PolishReplyResponse = {
  body: string;
};

// One day's ticket volume, for the dashboard's per-day bar chart. `date` is the
// UTC calendar day as an ISO date string (`YYYY-MM-DD`); `count` is the number of
// tickets created that day (same exclusions as `total` — no `new`/`processing`).
export const dailyTicketCountSchema = z.object({
  date: z.string(),
  count: z.number().int().nonnegative(),
});
export type DailyTicketCount = z.infer<typeof dailyTicketCountSchema>;

// Response from GET /api/tickets/stats — aggregate metrics for the dashboard.
// These are now computed by the `ticket_stats` SQL function (see the
// add_ticket_stats_function migration); this schema validates the JSON it returns.
// Counts exclude the intake-hidden `new`/`processing` statuses (`total` is
// open + resolved + closed). `aiResolved` is the subset of resolved tickets the AI
// agent answered (resolved + still assigned to it); the client derives the
// "% resolved by AI" rate as `aiResolved / resolved`. `avgResolutionMs` is the mean
// time from creation to resolution over resolved tickets (null when there are
// none); it approximates resolution time with `updatedAt − createdAt` — exact for
// AI resolutions (the worker's status write is the ticket's last update), and an
// approximation for agent resolutions, since a later edit bumps `updatedAt`.
// `daily` is a zero-filled series of the last 30 UTC days (oldest → newest) for the
// per-day volume chart.
export const ticketStatsResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  open: z.number().int().nonnegative(),
  resolved: z.number().int().nonnegative(),
  aiResolved: z.number().int().nonnegative(),
  avgResolutionMs: z.number().nullable(),
  daily: z.array(dailyTicketCountSchema),
});
export type TicketStatsResponse = z.infer<typeof ticketStatsResponseSchema>;

// Response from POST /api/tickets/:id/summary — an AI summary of the ticket and its
// reply thread, for the agent working it. The request has no body: everything the
// summary covers is already server-side, so the client sends only the ticket id.
//
// Nothing is persisted and nothing is cached — each request regenerates against the
// thread as it stands, so a summary can never describe a conversation that has since
// moved on. It's a POST rather than a GET for that reason: the call is expensive and
// non-idempotent-in-cost, and it must never be replayed from an HTTP cache.
export type SummarizeTicketResponse = {
  summary: string;
};
