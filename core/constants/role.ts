// Shared user role constant. Used by both client (route guards, session typing)
// and server. Union type (not enum) — the client has erasableSyntaxOnly enabled.
export const Role = {
  admin: "admin",
  agent: "agent",
} as const;

export type Role = (typeof Role)[keyof typeof Role];
