// Shared ticket domain types. Used by both client and server. The values double as
// runtime lists because they're needed at runtime — as Zod enums for validating the
// ticket-list filter params and as the option lists for the filter dropdowns — so
// each is an `as const` array whose element type is still the structural string
// union (e.g. Record<TicketStatus> keys stay exhaustive; values check against it).

export const ticketStatuses = ["open", "resolved", "closed"] as const;
export type TicketStatus = (typeof ticketStatuses)[number];

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
