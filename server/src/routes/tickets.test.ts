import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AddressInfo } from "node:net";
import express, { type Express } from "express";

import { Role } from "core/constants/role.ts";
import {
  createReplySchema,
  polishReplySchema,
  updateTicketSchema,
} from "core/schemas/tickets.ts";

// Mock the Prisma client (the router's only DB dependency) BEFORE importing the
// router, so importing it never touches the real database. The type-only
// `Prisma` import in the router is erased at runtime, so no other stubbing is
// needed. Each method is reset between tests.
const prismaMock = {
  ticket: { findUnique: mock(), update: mock() },
  user: { findFirst: mock() },
  ticketReply: { findMany: mock(), create: mock() },
};
mock.module("../db", () => ({ default: prismaMock }));

// Stub the AI helpers too, so the polish/summary routes' tests never reach OpenAI
// (no network, no API key, deterministic output).
const polishReplyMock = mock();
const summarizeTicketMock = mock();
mock.module("../lib/ai", () => ({
  polishReply: polishReplyMock,
  summarizeTicket: summarizeTicketMock,
}));

const { ticketsRouter } = await import("./tickets");

// A ticket row shaped like `detailSelect` (the columns the PATCH handler
// selects). `assignee` varies per test.
function ticketRow(assignee: { id: string; name: string } | null) {
  return {
    id: 103,
    subject: "Cannot log in",
    body: "Help",
    bodyHtml: null,
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
    // The handlers read req.user.role (assignment guard), req.user.id (reply
    // author), and req.user.name (polish sign-off), so a minimal stub with those
    // suffices; cast through unknown to sidestep the full augmented Better Auth
    // user type.
    (req as unknown as { user: { id: string; name: string; role: Role } }).user =
      {
        id: "agent-1",
        name: "Alice Agent",
        role,
      };
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
  prismaMock.ticketReply.findMany.mockReset();
  prismaMock.ticketReply.create.mockReset();
  polishReplyMock.mockReset();
  summarizeTicketMock.mockReset();
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
    prismaMock.ticket.findUnique.mockResolvedValue({ id: 103 });
    prismaMock.ticket.update.mockResolvedValue(ticketRow(null));

    const res = await send(makeApp(Role.agent), "PATCH", "/tickets/103", {
      status: "resolved",
      category: "refund_request",
    });

    expect(res.status).toBe(200);
    expect(prismaMock.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 103 },
        data: { status: "resolved", category: "refund_request" },
      }),
    );
    // A status/category edit never touches the assignee.
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  test("forbids a non-admin from (re)assigning", async () => {
    const res = await send(makeApp(Role.agent), "PATCH", "/tickets/103", {
      assigneeId: "u-1",
    });

    expect(res.status).toBe(403);
    // The guard short-circuits before any DB work.
    expect(prismaMock.ticket.findUnique).not.toHaveBeenCalled();
  });

  test("rejects an empty body before touching the ticket", async () => {
    const res = await send(makeApp(), "PATCH", "/tickets/103", {});

    expect(res.status).toBe(400);
    expect(prismaMock.ticket.findUnique).not.toHaveBeenCalled();
  });

  test("404s when the ticket does not exist", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(null);

    const res = await send(makeApp(), "PATCH", "/tickets/999", {
      status: "closed",
    });

    expect(res.status).toBe(404);
    expect(prismaMock.ticket.update).not.toHaveBeenCalled();
  });

  // Ids are integers now, so a non-numeric param can't identify a ticket. It's a
  // 404 like any other miss (not a 400) and never reaches the database — a
  // hand-typed URL shouldn't cost a query.
  test("404s on a non-numeric id without querying", async () => {
    const res = await send(makeApp(), "PATCH", "/tickets/abc", {
      status: "closed",
    });

    expect(res.status).toBe(404);
    expect(prismaMock.ticket.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.ticket.update).not.toHaveBeenCalled();
  });

  test("400s when the assignee is not a valid (active) user", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({ id: 103 });
    prismaMock.user.findFirst.mockResolvedValue(null); // no matching active user

    const res = await send(makeApp(), "PATCH", "/tickets/103", {
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
    prismaMock.ticket.findUnique.mockResolvedValue({ id: 103 });
    prismaMock.user.findFirst.mockResolvedValue({ id: "u-1" });
    prismaMock.ticket.update.mockResolvedValue(
      ticketRow({ id: "u-1", name: "Alice" }),
    );

    const res = await send(makeApp(), "PATCH", "/tickets/103", {
      assigneeId: "u-1",
    });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toEqual({ id: "u-1", name: "Alice" });
    // Dates are serialized to ISO strings.
    expect(res.body.createdAt).toBe("2026-03-01T00:00:00.000Z");
    expect(prismaMock.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 103 },
        data: { assigneeId: "u-1" },
      }),
    );
  });

  test("unassigns without validating a user when assigneeId is null", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({ id: 103 });
    prismaMock.ticket.update.mockResolvedValue(ticketRow(null));

    const res = await send(makeApp(), "PATCH", "/tickets/103", {
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

// A reply row shaped like `replySelect` (the columns the reply handlers select).
function replyRow(
  overrides?: Partial<{ id: number; body: string; bodyHtml: string | null }>,
) {
  return {
    id: 1,
    body: "On it — can you share a screenshot?",
    bodyHtml: null as string | null,
    senderType: "agent" as const,
    createdAt: new Date("2026-03-03T00:00:00.000Z"),
    author: { id: "agent-1", name: "Alice" },
    ...overrides,
  };
}

describe("createReplySchema", () => {
  test("accepts a non-empty body and trims it", () => {
    const parsed = createReplySchema.safeParse({ body: "  hello  " });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.body).toBe("hello");
  });

  test("rejects an empty or whitespace-only body", () => {
    expect(createReplySchema.safeParse({ body: "" }).success).toBe(false);
    expect(createReplySchema.safeParse({ body: "   " }).success).toBe(false);
  });
});

describe("polishReplySchema", () => {
  test("accepts a non-empty draft and trims it", () => {
    const parsed = polishReplySchema.safeParse({ body: "  we r on it  " });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.body).toBe("we r on it");
  });

  test("rejects an empty or whitespace-only draft", () => {
    // Nothing to polish — this is what keeps a blank request off the model.
    expect(polishReplySchema.safeParse({ body: "" }).success).toBe(false);
    expect(polishReplySchema.safeParse({ body: "   " }).success).toBe(false);
  });

  test("shares createReplySchema's length limit, so a polishable draft is sendable", () => {
    // The polished text goes back into the compose box and must still pass the
    // send schema; a draft the polisher accepts but sending rejects would trap the
    // agent with text they cannot post.
    const max = "a".repeat(10000);
    expect(polishReplySchema.safeParse({ body: max }).success).toBe(true);
    expect(createReplySchema.safeParse({ body: max }).success).toBe(true);

    const tooLong = "a".repeat(10001);
    expect(polishReplySchema.safeParse({ body: tooLong }).success).toBe(false);
    expect(createReplySchema.safeParse({ body: tooLong }).success).toBe(false);
  });

  test("ignores unknown fields rather than trusting them", () => {
    // The route signs replies with the session's agent; a body-supplied name must
    // never survive parsing into the handler's data.
    const parsed = polishReplySchema.safeParse({
      body: "draft",
      agentName: "Mallory",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty("agentName");
  });
});

describe("GET /tickets/:id/replies", () => {
  test("returns the thread with ISO dates", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({ id: 103 });
    prismaMock.ticketReply.findMany.mockResolvedValue([replyRow()]);

    const res = await send(makeApp(Role.agent), "GET", "/tickets/103/replies");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 1,
        body: "On it — can you share a screenshot?",
        bodyHtml: null,
        senderType: "agent",
        createdAt: "2026-03-03T00:00:00.000Z",
        author: { id: "agent-1", name: "Alice" },
      },
    ]);
    // Oldest first, scoped to the ticket.
    expect(prismaMock.ticketReply.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ticketId: 103 },
        orderBy: { createdAt: "asc" },
      }),
    );
  });

  test("404s when the ticket does not exist", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(null);

    const res = await send(makeApp(), "GET", "/tickets/999/replies");

    expect(res.status).toBe(404);
    expect(prismaMock.ticketReply.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /tickets/:id/replies", () => {
  test("creates a reply authored by the current user", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({ id: 103 });
    prismaMock.ticketReply.create.mockResolvedValue(replyRow());

    const res = await send(makeApp(Role.agent), "POST", "/tickets/103/replies", {
      body: "On it",
    });

    expect(res.status).toBe(201);
    expect(res.body.author).toEqual({ id: "agent-1", name: "Alice" });
    expect(res.body.createdAt).toBe("2026-03-03T00:00:00.000Z");
    expect(prismaMock.ticketReply.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: 103,
          body: "On it",
          senderType: "agent",
          authorId: "agent-1",
        }),
      }),
    );
  });

  test("rejects an empty body before touching the ticket", async () => {
    const res = await send(makeApp(), "POST", "/tickets/103/replies", {
      body: "   ",
    });

    expect(res.status).toBe(400);
    expect(prismaMock.ticket.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.ticketReply.create).not.toHaveBeenCalled();
  });

  test("404s when the ticket does not exist", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(null);

    const res = await send(makeApp(), "POST", "/tickets/999/replies", {
      body: "hello",
    });

    expect(res.status).toBe(404);
    expect(prismaMock.ticketReply.create).not.toHaveBeenCalled();
  });
});

describe("POST /tickets/:id/replies/polish", () => {
  test("returns the polished draft, grounded in the ticket", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({
      subject: "Cannot log in",
      body: "Help",
      requesterName: "Sam Customer",
    });
    polishReplyMock.mockResolvedValue("We're on it — sorry for the trouble.");

    const res = await send(
      makeApp(Role.agent),
      "POST",
      "/tickets/103/replies/polish",
      { body: "we r on it" },
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ body: "We're on it — sorry for the trouble." });
    expect(polishReplyMock).toHaveBeenCalledWith({
      draft: "we r on it",
      subject: "Cannot log in",
      ticketBody: "Help",
      requesterName: "Sam Customer",
      agentName: "Alice Agent",
    });
  });

  test("signs with the session's agent, not anything in the request body", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({
      subject: "Cannot log in",
      body: "Help",
      requesterName: "Sam Customer",
    });
    polishReplyMock.mockResolvedValue("Polished.");

    // A caller trying to sign the reply as someone else must be ignored.
    await send(makeApp(Role.agent), "POST", "/tickets/103/replies/polish", {
      body: "draft",
      agentName: "Mallory",
    });

    expect(polishReplyMock).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: "Alice Agent" }),
    );
  });

  test("passes a null requester name through rather than inventing one", async () => {
    // Inbound email often carries no name — the helper handles the fallback, so the
    // route must not substitute a placeholder.
    prismaMock.ticket.findUnique.mockResolvedValue({
      subject: "Cannot log in",
      body: "Help",
      requesterName: null,
    });
    polishReplyMock.mockResolvedValue("Polished.");

    await send(makeApp(Role.agent), "POST", "/tickets/103/replies/polish", {
      body: "draft",
    });

    expect(polishReplyMock).toHaveBeenCalledWith(
      expect.objectContaining({ requesterName: null }),
    );
  });

  test("persists nothing — polishing is a pure transform", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({
      subject: "Cannot log in",
      body: "Help",
      requesterName: "Sam Customer",
    });
    polishReplyMock.mockResolvedValue("Polished.");

    await send(makeApp(Role.agent), "POST", "/tickets/103/replies/polish", {
      body: "draft",
    });

    expect(prismaMock.ticketReply.create).not.toHaveBeenCalled();
    expect(prismaMock.ticket.update).not.toHaveBeenCalled();
  });

  test("rejects an empty draft without calling the model", async () => {
    const res = await send(
      makeApp(Role.agent),
      "POST",
      "/tickets/103/replies/polish",
      { body: "   " },
    );

    expect(res.status).toBe(400);
    expect(polishReplyMock).not.toHaveBeenCalled();
  });

  test("404s for an unknown ticket without calling the model", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(null);

    const res = await send(
      makeApp(Role.agent),
      "POST",
      "/tickets/ghost/replies/polish",
      { body: "draft" },
    );

    expect(res.status).toBe(404);
    expect(polishReplyMock).not.toHaveBeenCalled();
  });

  test("502s with a JSON error when the model call fails", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({
      subject: "Cannot log in",
      body: "Help",
      requesterName: "Sam Customer",
    });
    polishReplyMock.mockRejectedValue(new Error("upstream is down"));

    const res = await send(
      makeApp(Role.agent),
      "POST",
      "/tickets/103/replies/polish",
      { body: "draft" },
    );

    expect(res.status).toBe(502);
    expect(res.body.error).toBeString();
  });
});

describe("POST /tickets/:id/summary", () => {
  // The ticket columns the summary route selects.
  function summaryTicket(requesterName: string | null = "Sam Customer") {
    return { subject: "Cannot log in", body: "Help, I'm locked out", requesterName };
  }

  test("summarizes the ticket together with its reply thread", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(summaryTicket());
    prismaMock.ticketReply.findMany.mockResolvedValue([
      {
        senderType: "agent",
        body: "Can you share a screenshot?",
        author: { name: "Alice" },
      },
      { senderType: "customer", body: "Here it is.", author: null },
    ]);
    summarizeTicketMock.mockResolvedValue("Sam is locked out; Alice asked for a screenshot.");

    const res = await send(makeApp(Role.agent), "POST", "/tickets/103/summary");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      summary: "Sam is locked out; Alice asked for a screenshot.",
    });
    // The thread is read server-side and flattened to the helper's shape — the
    // customer's turn carries no author name, the agent's does.
    expect(summarizeTicketMock).toHaveBeenCalledWith({
      subject: "Cannot log in",
      ticketBody: "Help, I'm locked out",
      requesterName: "Sam Customer",
      replies: [
        {
          senderType: "agent",
          body: "Can you share a screenshot?",
          authorName: "Alice",
        },
        { senderType: "customer", body: "Here it is.", authorName: null },
      ],
    });
  });

  test("reads the thread oldest first, scoped to the ticket", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(summaryTicket());
    prismaMock.ticketReply.findMany.mockResolvedValue([]);
    summarizeTicketMock.mockResolvedValue("Summary.");

    await send(makeApp(Role.agent), "POST", "/tickets/103/summary");

    // The prompt tells the model the thread is chronological, so the order the
    // rows arrive in is load-bearing, not cosmetic.
    expect(prismaMock.ticketReply.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ticketId: 103 },
        orderBy: { createdAt: "asc" },
      }),
    );
  });

  test("summarizes a ticket with no replies yet", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(summaryTicket());
    prismaMock.ticketReply.findMany.mockResolvedValue([]);
    summarizeTicketMock.mockResolvedValue("Sam is locked out. Nobody has replied.");

    const res = await send(makeApp(Role.agent), "POST", "/tickets/103/summary");

    // An empty thread is normal (a brand-new ticket), not an error.
    expect(res.status).toBe(200);
    expect(summarizeTicketMock).toHaveBeenCalledWith(
      expect.objectContaining({ replies: [] }),
    );
  });

  test("names an agent whose account was hard-deleted as no one", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(summaryTicket());
    prismaMock.ticketReply.findMany.mockResolvedValue([
      { senderType: "agent", body: "Looking into it.", author: null },
    ]);
    summarizeTicketMock.mockResolvedValue("Summary.");

    await send(makeApp(Role.agent), "POST", "/tickets/103/summary");

    // The reply outlives its author; it's still an agent turn, just unattributed.
    expect(summarizeTicketMock).toHaveBeenCalledWith(
      expect.objectContaining({
        replies: [
          { senderType: "agent", body: "Looking into it.", authorName: null },
        ],
      }),
    );
  });

  test("passes a null requester name through rather than inventing one", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(summaryTicket(null));
    prismaMock.ticketReply.findMany.mockResolvedValue([]);
    summarizeTicketMock.mockResolvedValue("Summary.");

    await send(makeApp(Role.agent), "POST", "/tickets/103/summary");

    expect(summarizeTicketMock).toHaveBeenCalledWith(
      expect.objectContaining({ requesterName: null }),
    );
  });

  test("persists nothing — the summary is regenerated per request", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(summaryTicket());
    prismaMock.ticketReply.findMany.mockResolvedValue([]);
    summarizeTicketMock.mockResolvedValue("Summary.");

    await send(makeApp(Role.agent), "POST", "/tickets/103/summary");

    expect(prismaMock.ticket.update).not.toHaveBeenCalled();
    expect(prismaMock.ticketReply.create).not.toHaveBeenCalled();
  });

  test("404s for an unknown ticket without calling the model", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(null);

    const res = await send(makeApp(Role.agent), "POST", "/tickets/ghost/summary");

    expect(res.status).toBe(404);
    expect(summarizeTicketMock).not.toHaveBeenCalled();
    expect(prismaMock.ticketReply.findMany).not.toHaveBeenCalled();
  });

  test("502s with a JSON error when the model call fails", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(summaryTicket());
    prismaMock.ticketReply.findMany.mockResolvedValue([]);
    summarizeTicketMock.mockRejectedValue(new Error("upstream is down"));

    const res = await send(makeApp(Role.agent), "POST", "/tickets/103/summary");

    // A JSON body (not Express's HTML 500) is what lets ErrorAlert show a message.
    expect(res.status).toBe(502);
    expect(res.body.error).toBeString();
  });
});
