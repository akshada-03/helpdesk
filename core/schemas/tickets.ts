import { z } from "zod/v4";

import {
  ticketCategories,
  ticketStatuses,
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
  status: z.enum(ticketStatuses).optional(),
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
  id: string;
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
// an agent is assigned.
export type TicketDetail = {
  id: string;
  subject: string;
  body: string;
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
    status: z.enum(ticketStatuses).optional(),
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
  id: string;
  body: string;
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
