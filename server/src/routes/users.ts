import { Router } from "express";
import { Role } from "core/constants/role.ts";
import type { UserListResponse } from "core/schemas/users.ts";

import prisma from "../db";
import { requireRole } from "../middleware/require-role";

export const usersRouter = Router();

// Admin-only user list. requireAuth is already applied by the parent apiRouter,
// so this only needs the role guard on top. Selects a safe subset of columns —
// never exposes anything auth-sensitive (credentials live on the Account model).
usersRouter.get("/", requireRole(Role.admin), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerified: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const body: UserListResponse = {
    users: users.map((user) => ({
      ...user,
      createdAt: user.createdAt.toISOString(),
    })),
  };
  res.json(body);
});
