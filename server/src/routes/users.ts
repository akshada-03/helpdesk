import { Router } from "express";
import { Role } from "core/constants/role.ts";
import { createUserSchema, updateUserSchema } from "core/schemas/users.ts";
import type {
  AgentListResponse,
  UserListItem,
  UserListResponse,
} from "core/schemas/users.ts";

import prisma from "../db";
import { Role as UserRole } from "../generated/prisma/enums";
import { AI_AGENT_ID } from "../lib/ai-agent";
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

// Assignable agents, for populating the ticket-assignee dropdown. Admin-only —
// only admins assign tickets, so this is the sole consumer. Returns every active
// user (both roles handle tickets) with just the identity fields the dropdown
// needs; never the auth-sensitive columns exposed nowhere outside /users.
export const agentsRouter = Router();

agentsRouter.get("/", requireRole(Role.admin), async (_req, res) => {
  const agents = await prisma.user.findMany({
    // The AI agent is a system identity auto-resolution runs as, not a human an
    // admin assigns work to, so it's excluded from the assignee dropdown.
    where: { deletedAt: null, id: { not: AI_AGENT_ID } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  const body: AgentListResponse = { agents };
  res.json(body);
});

export const usersRouter = Router();

// Admin-only user list. requireAuth is already applied by the parent apiRouter,
// so this only needs the role guard on top. Selects a safe subset of columns —
// never exposes anything auth-sensitive (credentials live on the Account model).
usersRouter.get("/", requireRole(Role.admin), async (_req, res) => {
  const users = await prisma.user.findMany({
    // Soft-deleted users are hidden from the admin list, as is the AI agent (a
    // system identity, not a managed human account).
    where: { deletedAt: null, id: { not: AI_AGENT_ID } },
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
// holds the hash) atomically. The admin picks the role (validated to admin or
// agent by createUserSchema).
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
        role: data.role as UserRole,
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
    role: data.role,
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
      data: {
        name: data.name,
        email: data.email,
        role: data.role as UserRole,
        updatedAt: now,
      },
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
    role: data.role,
    emailVerified: existing.emailVerified,
    createdAt: existing.createdAt.toISOString(),
  };
  res.json({ user });
});

// Admin-only soft delete. The user row is preserved (deletedAt is stamped) but
// hidden from the list and blocked from signing in (see the session hook in
// lib/auth.ts). Admins can never be deleted. Any active sessions are revoked so
// the user is logged out immediately, and their tickets are unassigned so they
// return to the queue — Ticket.assignee's onDelete: SetNull only fires on a hard
// delete, so the soft delete has to do it explicitly. Authored replies keep their
// authorId: the thread is an audit trail, not a work queue.
usersRouter.delete("/:id", requireRole(Role.admin), async (req, res) => {
  const id = req.params.id as string;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (existing.role === UserRole.admin) {
    res.status(403).json({ error: "Admin users cannot be deleted" });
    return;
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { deletedAt: now, updatedAt: now },
    });
    await tx.session.deleteMany({ where: { userId: id } });
    await tx.ticket.updateMany({
      where: { assigneeId: id },
      data: { assigneeId: null },
    });
  });

  res.status(204).end();
});
