// The dedicated "AI" agent user. Auto-resolution runs as this agent: an inbound
// ticket is assigned to it while the pipeline works, and a ticket it answers stays
// assigned to it (and its auto-reply is authored by it). That makes "resolved by
// AI" an exact query — status `resolved` with `assigneeId = AI_AGENT_ID` — with no
// schema flag or `authorId IS NULL` heuristic. Seeded by prisma/seed.ts as a
// role-agent User with no credential Account (it never signs in), and hidden from
// the human-facing user/assignee lists in routes/users.ts.
//
// The id is a fixed, well-known string (User.id is a String, not a UUID) so the
// webhook and worker can set `assigneeId: AI_AGENT_ID` without a lookup.
export const AI_AGENT_ID = "ai-agent";
export const AI_AGENT_EMAIL = "ai@helpdesk.local";
export const AI_AGENT_NAME = "AI";
