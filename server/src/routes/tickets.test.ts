import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AddressInfo } from "node:net";
import express, { type Express } from "express";

import { Role } from "core/constants/role.ts";
import { assignTicketSchema } from "core/schemas/tickets.ts";

// Mock the Prisma client (the router's only DB dependency) BEFORE importing the
// router, so importing it never touches the real database. The type-only
// `Prisma` import in the router is erased at runtime, so no other stubbing is
// needed. Each method is reset between tests.
const prismaMock = {
  ticket: { findUnique: mock(), update: mock() },
  user: { findFirst: mock() },
};
mock.module("../db", () => ({ default: prismaMock }));

const { ticketsRouter } = await import("./tickets");

// A ticket row shaped like `detailSelect` (the columns the PATCH handler
// selects). `assignee` varies per test.
function ticketRow(assignee: { id: string; name: string } | null) {
  return {
    id: "t-1",
    subject: "Cannot log in",
    body: "Help",
    requesterEmail: "sam@example.com",
    requesterName: null,
    status: "open",
    category: null,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-02T00:00:00.000Z"),
    assignee,
  };
}

// Mounts the router behind a middleware that injects `req.user` with the given
// role, standing in for the real requireAuth guard the parent apiRouter applies.
function makeApp(role: Role = Role.admin): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // requireRole only reads req.user.role, so a minimal stub suffices; cast
    // through unknown to sidestep the full augmented Better Auth user type.
    (req as unknown as { user: { role: Role } }).user = { role };
    next();
  });
  app.use("/tickets", ticketsRouter);
  return app;
}

// Sends one request against a freshly-listened server and returns the parsed
// response. Listening on port 0 picks an ephemeral port; the server is always
// closed afterward.
async function send(
  app: Express,
  method: string,
  path: string,
  body?: unknown,
) {
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  } finally {
    server.close();
  }
}

beforeEach(() => {
  prismaMock.ticket.findUnique.mockReset();
  prismaMock.ticket.update.mockReset();
  prismaMock.user.findFirst.mockReset();
});

describe("assignTicketSchema", () => {
  test("accepts a non-empty assignee id", () => {
    const result = assignTicketSchema.safeParse({ assigneeId: "u-1" });
    expect(result.success).toBe(true);
  });

  test("accepts null (the unassign case)", () => {
    const result = assignTicketSchema.safeParse({ assigneeId: null });
    expect(result.success).toBe(true);
  });

  test("rejects an empty-string id", () => {
    expect(assignTicketSchema.safeParse({ assigneeId: "" }).success).toBe(false);
  });

  test("rejects a missing assigneeId field", () => {
    expect(assignTicketSchema.safeParse({}).success).toBe(false);
  });

  test("rejects a non-string, non-null id", () => {
    expect(assignTicketSchema.safeParse({ assigneeId: 42 }).success).toBe(false);
  });
});

describe("PATCH /tickets/:id (assign)", () => {
  test("forbids non-admins", async () => {
    const res = await send(makeApp(Role.agent), "PATCH", "/tickets/t-1", {
      assigneeId: "u-1",
    });

    expect(res.status).toBe(403);
    // The guard short-circuits before any DB work.
    expect(prismaMock.ticket.findUnique).not.toHaveBeenCalled();
  });

  test("rejects an invalid body before touching the ticket", async () => {
    const res = await send(makeApp(), "PATCH", "/tickets/t-1", {
      assigneeId: "",
    });

    expect(res.status).toBe(400);
    expect(prismaMock.ticket.findUnique).not.toHaveBeenCalled();
  });

  test("404s when the ticket does not exist", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(null);

    const res = await send(makeApp(), "PATCH", "/tickets/missing", {
      assigneeId: "u-1",
    });

    expect(res.status).toBe(404);
    expect(prismaMock.ticket.update).not.toHaveBeenCalled();
  });

  test("400s when the assignee is not a valid (active) user", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({ id: "t-1" });
    prismaMock.user.findFirst.mockResolvedValue(null); // no matching active user

    const res = await send(makeApp(), "PATCH", "/tickets/t-1", {
      assigneeId: "ghost",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Assignee is not a valid agent" });
    // Existence check excludes soft-deleted users.
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { id: "ghost", deletedAt: null },
      select: { id: true },
    });
    expect(prismaMock.ticket.update).not.toHaveBeenCalled();
  });

  test("assigns the ticket when the agent is valid", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({ id: "t-1" });
    prismaMock.user.findFirst.mockResolvedValue({ id: "u-1" });
    prismaMock.ticket.update.mockResolvedValue(
      ticketRow({ id: "u-1", name: "Alice" }),
    );

    const res = await send(makeApp(), "PATCH", "/tickets/t-1", {
      assigneeId: "u-1",
    });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toEqual({ id: "u-1", name: "Alice" });
    // Dates are serialized to ISO strings.
    expect(res.body.createdAt).toBe("2026-03-01T00:00:00.000Z");
    expect(prismaMock.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t-1" },
        data: { assigneeId: "u-1" },
      }),
    );
  });

  test("unassigns without validating a user when assigneeId is null", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({ id: "t-1" });
    prismaMock.ticket.update.mockResolvedValue(ticketRow(null));

    const res = await send(makeApp(), "PATCH", "/tickets/t-1", {
      assigneeId: null,
    });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toBeNull();
    // No user lookup for the unassign case.
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { assigneeId: null } }),
    );
  });
});
