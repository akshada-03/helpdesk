import { Router } from "express";
import { requireAuth } from "./middleware/require-auth";
import { agentsRouter, meRouter, usersRouter } from "./routes/users";
import { ticketsRouter } from "./routes/tickets";
import { webhooksRouter } from "./routes/webhooks";
import { knowledgeBaseRouter } from "./routes/knowledge-base";

export const apiRouter = Router();

// --- Public routes (no auth) ---

// Health check — used by load balancers/monitoring; must stay unauthenticated.
apiRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Inbound email webhook (SendGrid Inbound Parse) — the email provider is
// unauthenticated, so this must stay public. It does its own optional token check.
apiRouter.use("/webhooks", webhooksRouter);

// Public knowledge base articles & support guidelines
apiRouter.use("/knowledge-base", knowledgeBaseRouter);

// --- Authenticated routes ---
// Everything registered BELOW this line requires a valid session. Because
// requireAuth is mounted on the router here, new data routes are protected by
// default — add them below (never above) so auth can't be forgotten. For
// admin-only actions, add requireRole(Role.admin) after requireAuth on the route.
apiRouter.use(requireAuth);

// User endpoints (both live in routes/users.ts). /me returns the currently
// authenticated user; /users is admin-only management (the router applies
// requireRole(Role.admin) per route on top of the requireAuth guard above).
apiRouter.use("/me", meRouter);
apiRouter.use("/users", usersRouter);

// Assignable agents for the ticket-assignee dropdown — admin-only (the router
// applies requireRole per route). Defined alongside the other user endpoints.
apiRouter.use("/agents", agentsRouter);

// Ticket list (agents + admins). Created from inbound email via the webhook above.
apiRouter.use("/tickets", ticketsRouter);
