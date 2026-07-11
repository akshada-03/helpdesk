import { Router } from "express";
import { requireAuth } from "./middleware/require-auth";
import { meRouter, usersRouter } from "./routes/users";
import { ticketsRouter } from "./routes/tickets";
import { webhooksRouter } from "./routes/webhooks";

export const apiRouter = Router();

// --- Public routes (no auth) ---

// Health check — used by load balancers/monitoring; must stay unauthenticated.
apiRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Inbound email webhook (SendGrid Inbound Parse) — the email provider is
// unauthenticated, so this must stay public. It does its own optional token check.
apiRouter.use("/webhooks", webhooksRouter);

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

// Ticket list (agents + admins). Created from inbound email via the webhook above.
apiRouter.use("/tickets", ticketsRouter);
