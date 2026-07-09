import type { Request, Response, NextFunction } from "express";
import { Role } from "core/constants/role.ts";

// Authorizes by role. MUST run after requireAuth (it relies on req.user being
// set). Responds 401 if there is no authenticated user, or 403 if that user's
// role is not among the allowed roles.
//
// Usage: apiRouter.get("/users", requireRole(Role.admin), handler)
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.user.role as Role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
