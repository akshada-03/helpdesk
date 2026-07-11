import { Router } from "express";
import { Role } from "core/constants/role.ts";
import { createUserSchema } from "core/schemas/users.ts";
import type { UserListItem, UserListResponse } from "core/schemas/users.ts";

import prisma from "../db";
import { Role as UserRole } from "../generated/prisma/enums";
import { auth } from "../lib/auth";
import { validate } from "../lib/validate";
import { requireRole } from "../middleware/require-role";

// Current-user endpoint, mounted at /api/me. requireAuth (applied by the parent
// apiRouter) guarantees req.user is set, so the client can confirm the session
// and read the role. Lives here alongside the other user endpoints.
export const meRouter = Router();

meRouter.get("/", (req, res) => {
  res.json({ user: req.user });
});

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

// Admin-only user creation. Sign-up is disabled through Better Auth's API, so we
// create the user the same way the seed script does: hash the password with
// Better Auth's own hasher, then insert the User + a `credential` Account (which
// holds the hash) atomically. Role is not accepted from the client — new users
// are always created as `agent`.
usersRouter.post("/", requireRole(Role.admin), async (req, res) => {
  const data = validate(createUserSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existing) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  const ctx = await auth.$context;
  const hashedPassword = await ctx.password.hash(data.password);
  const now = new Date();
  const id = crypto.randomUUID();

  await prisma.$transaction([
    prisma.user.create({
      data: {
        id,
        email: data.email,
        name: data.name,
        role: UserRole.agent,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    }),
    prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        accountId: id,
        providerId: "credential",
        userId: id,
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
      },
    }),
  ]);

  const user: UserListItem = {
    id,
    name: data.name,
    email: data.email,
    role: Role.agent,
    emailVerified: true,
    createdAt: now.toISOString(),
  };
  res.status(201).json({ user });
});
