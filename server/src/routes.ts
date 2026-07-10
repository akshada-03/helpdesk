import { Router } from "express";
import { requireAuth } from "./middleware/require-auth";
import { usersRouter } from "./routes/users";

export const apiRouter = Router();

// --- Public routes (no auth) ---

// Health check — used by load balancers/monitoring; must stay unauthenticated.
apiRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- Authenticated routes ---
// Everything registered BELOW this line requires a valid session. Because
// requireAuth is mounted on the router here, new data routes are protected by
// default — add them below (never above) so auth can't be forgotten. For
// admin-only actions, add requireRole(Role.admin) after requireAuth on the route.
apiRouter.use(requireAuth);

// Returns the currently authenticated user (handy for the client to confirm the
// session and read the role). requireAuth guarantees req.user is set here.
apiRouter.get("/me", (req, res) => {
  res.json({ user: req.user });
});

// Admin-only user management. The router applies requireRole(Role.admin) per
// route on top of the requireAuth guard mounted above.
apiRouter.use("/users", usersRouter);
