// Shared ticket domain types. Used by both client and server. The values double as
// runtime lists because they're needed at runtime — as Zod enums for validating the
// ticket-list filter params and as the option lists for the filter dropdowns — so
// each is an `as const` array whose element type is still the structural string
// union (e.g. Record<TicketStatus> keys stay exhaustive; values check against it).

// The full status set, mirroring the Prisma `TicketStatus` enum. `new` and
// `processing` are system-managed states in the AI intake pipeline (a ticket is
// created `new`, the auto-resolve worker moves it to `processing`, then to a
// terminal status) — they exist in the type so payloads can carry them, but
// agents never set them.
export const ticketStatuses = [
  "open",
  "resolved",
  "closed",
  "new",
  "processing",
] as const;
export type TicketStatus = (typeof ticketStatuses)[number];

// The statuses agents actually work with — used for the status filter, the
// status editor, and what PATCH /api/tickets/:id accepts. `new`/`processing` are
// deliberately excluded: they're hidden from the list and must not be settable by
// hand (the AI pipeline owns those transitions).
export const agentTicketStatuses = ["open", "resolved", "closed"] as const;
export type AgentTicketStatus = (typeof agentTicketStatuses)[number];

export const ticketCategories = [
  "general_question",
  "technical_question",
  "refund_request",
] as const;
export type TicketCategory = (typeof ticketCategories)[number];

// Who authored a ticket reply. `agent` replies are posted by an app User (via the
// detail page); `customer` replies come from the requester (e.g. an email
// follow-up). Runtime array so it doubles as a Zod enum / Prisma enum mirror.
export const replySenderTypes = ["agent", "customer"] as const;
export type ReplySenderType = (typeof replySenderTypes)[number];
