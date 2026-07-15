import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AddressInfo } from "node:net";
import express, { type Express } from "express";

import { Role } from "core/constants/role.ts";

// Mock the router's runtime dependencies BEFORE importing it, so importing it
// never touches the real database or Better Auth. `$transaction` runs its
// callback against the same mock, which is enough to assert what the delete
// handler writes. Each method is reset between tests.
const prismaMock = {
  user: { findUnique: mock(), update: mock() },
  session: { deleteMany: mock() },
  ticket: { updateMany: mock() },
  $transaction: mock(async (fn: (tx: unknown) => unknown) => fn(prismaMock)),
};
mock.module("../db", () => ({ default: prismaMock }));
mock.module("../lib/auth", () => ({ auth: { $context: Promise.resolve({}) } }));

const { usersRouter } = await import("./users");

// A User row shaped like the columns the DELETE handler reads.
function userRow(overrides: Partial<{ id: string; role: Role; deletedAt: Date | null }> = {}) {
  return {
    id: "u-1",
    name: "Sam Agent",
    email: "sam@example.com",
    role: Role.agent,
    deletedAt: null,
    ...overrides,
  };
}

// Mounts the router behind a middleware that injects `req.user` with the given
// role, standing in for the real requireAuth guard the parent apiRouter applies.
function makeApp(role: Role = Role.admin): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { user: { id: string; role: Role } }).user = {
      id: "admin-1",
      role,
    };
    next();
  });
  app.use("/users", usersRouter);
  return app;
}

// Sends one request against a freshly-listened server and returns the parsed
// response. Listening on port 0 picks an ephemeral port; the server is always
// closed afterward.
async function send(app: Express, method: string, path: string) {
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}${path}`, { method });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  } finally {
    server.close();
  }
}

describe("DELETE /users/:id", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockReset();
    prismaMock.user.update.mockReset();
    prismaMock.session.deleteMany.mockReset();
    prismaMock.ticket.updateMany.mockReset();
  });

  test("unassigns the deleted user's tickets", async () => {
    prismaMock.user.findUnique.mockResolvedValue(userRow());

    const res = await send(makeApp(), "DELETE", "/users/u-1");

    expect(res.status).toBe(204);
    expect(prismaMock.ticket.updateMany).toHaveBeenCalledWith({
      where: { assigneeId: "u-1" },
      data: { assigneeId: null },
    });
  });

  test("soft-deletes the user and revokes their sessions", async () => {
    prismaMock.user.findUnique.mockResolvedValue(userRow());

    const res = await send(makeApp(), "DELETE", "/users/u-1");

    expect(res.status).toBe(204);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: { deletedAt: expect.any(Date), updatedAt: expect.any(Date) },
    });
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u-1" },
    });
  });

  test("leaves tickets alone when the user cannot be deleted", async () => {
    prismaMock.user.findUnique.mockResolvedValue(userRow({ role: Role.admin }));

    const res = await send(makeApp(), "DELETE", "/users/u-1");

    expect(res.status).toBe(403);
    expect(prismaMock.ticket.updateMany).not.toHaveBeenCalled();
  });

  test("leaves tickets alone for an already-deleted user", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      userRow({ deletedAt: new Date("2026-01-01T00:00:00.000Z") }),
    );

    const res = await send(makeApp(), "DELETE", "/users/u-1");

    expect(res.status).toBe(404);
    expect(prismaMock.ticket.updateMany).not.toHaveBeenCalled();
  });
});
