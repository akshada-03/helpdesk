// Shared ticket domain types. Used by both client and server. Plain union types —
// consumers use the string literals directly, kept type-safe by the union (e.g.
// Record<TicketStatus> keys stay exhaustive; values are checked against the type).

export type TicketStatus = "open" | "resolved" | "closed";

export type TicketCategory =
  | "general_question"
  | "technical_question"
  | "refund_request";
