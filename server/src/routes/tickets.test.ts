import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AddressInfo } from "node:net";
import express, { type Express } from "express";

import { Role } from "core/constants/role.ts";
import { updateTicketSchema } from "core/schemas/tickets.ts";

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

describe("updateTicketSchema", () => {
  test("accepts a status-only update", () => {
    expect(updateTicketSchema.safeParse({ status: "resolved" }).success).toBe(
      true,
    );
  });

  test("accepts a category-only update, including null", () => {
    expect(
      updateTicketSchema.safeParse({ category: "refund_request" }).success,
    ).toBe(true);
    expect(updateTicketSchema.safeParse({ category: null }).success).toBe(true);
  });

  test("accepts an assignee id or null", () => {
    expect(updateTicketSchema.safeParse({ assigneeId: "u-1" }).success).toBe(
      true,
    );
    expect(updateTicketSchema.safeParse({ assigneeId: null }).success).toBe(
      true,
    );
  });

  test("rejects an empty body (nothing to update)", () => {
    expect(updateTicketSchema.safeParse({}).success).toBe(false);
  });

  test("rejects unknown enum values and an empty assignee id", () => {
    expect(updateTicketSchema.safeParse({ status: "nope" }).success).toBe(false);
    expect(updateTicketSchema.safeParse({ category: "nope" }).success).toBe(
      false,
    );
    expect(updateTicketSchema.safeParse({ assigneeId: "" }).success).toBe(false);
  });
});

describe("PATCH /tickets/:id (update)", () => {
  test("lets an agent update status/category (no admin needed)", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({ id: "t-1" });
    prismaMock.ticket.update.mockResolvedValue(ticketRow(null));

    const res = await send(makeApp(Role.agent), "PATCH", "/tickets/t-1", {
      status: "resolved",
      category: "refund_request",
    });

    expect(res.status).toBe(200);
    expect(prismaMock.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t-1" },
        data: { status: "resolved", category: "refund_request" },
      }),
    );
    // A status/category edit never touches the assignee.
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  test("forbids a non-admin from (re)assigning", async () => {
    const res = await send(makeApp(Role.agent), "PATCH", "/tickets/t-1", {
      assigneeId: "u-1",
    });

    expect(res.status).toBe(403);
    // The guard short-circuits before any DB work.
    expect(prismaMock.ticket.findUnique).not.toHaveBeenCalled();
  });

  test("rejects an empty body before touching the ticket", async () => {
    const res = await send(makeApp(), "PATCH", "/tickets/t-1", {});

    expect(res.status).toBe(400);
    expect(prismaMock.ticket.findUnique).not.toHaveBeenCalled();
  });

  test("404s when the ticket does not exist", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(null);

    const res = await send(makeApp(), "PATCH", "/tickets/missing", {
      status: "closed",
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

  test("assigns the ticket when an admin picks a valid agent", async () => {
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
