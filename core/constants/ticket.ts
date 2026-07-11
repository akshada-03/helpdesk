// Shared ticket domain enums. Used by both client and server. `as const` objects
// (not TS `enum`) — same pattern as Role: gives runtime members (TicketStatus.open)
// while the value type stays a plain string-literal union, so Prisma's generated
// string values assign cleanly with no casts.

export const TicketStatus = {
  open: "open",
  resolved: "resolved",
  closed: "closed",
} as const;

export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

export const TicketCategory = {
  general_question: "general_question",
  technical_question: "technical_question",
  refund_request: "refund_request",
} as const;

export type TicketCategory = (typeof TicketCategory)[keyof typeof TicketCategory];
