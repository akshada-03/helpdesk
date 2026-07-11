import { Router } from "express";
import { Role } from "core/constants/role.ts";
import { createUserSchema, updateUserSchema } from "core/schemas/users.ts";
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

// Admin-only user update. Name and email are always updated; role is never
// editable. Password is optional — a non-empty value re-hashes and replaces the
// hash on the user's `credential` Account (the same place the seed/create flow
// stores it), while a blank value leaves the existing password untouched.
usersRouter.patch("/:id", requireRole(Role.admin), async (req, res) => {
  const data = validate(updateUserSchema, req.body, res);
  if (!data) return;

  // A plain ":id" segment is always a single value; @types/express widens it to
  // string | string[], so narrow it here.
  const id = req.params.id as string;
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Only guard uniqueness when the email actually changes, and allow the user to
  // keep their own address (the conflict must belong to a *different* user).
  if (data.email !== existing.email) {
    const emailOwner = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (emailOwner && emailOwner.id !== id) {
      res.status(409).json({ error: "A user with this email already exists" });
      return;
    }
  }

  const now = new Date();

  // Hash outside the transaction so bcrypt work doesn't hold it open. Null means
  // "no password change".
  let hashedPassword: string | null = null;
  if (data.password !== "") {
    const ctx = await auth.$context;
    hashedPassword = await ctx.password.hash(data.password);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { name: data.name, email: data.email, updatedAt: now },
    });
    if (hashedPassword !== null) {
      await tx.account.updateMany({
        where: { userId: id, providerId: "credential" },
        data: { password: hashedPassword, updatedAt: now },
      });
    }
  });

  const user: UserListItem = {
    id,
    name: data.name,
    email: data.email,
    role: existing.role as Role,
    emailVerified: existing.emailVerified,
    createdAt: existing.createdAt.toISOString(),
  };
  res.json({ user });
});
