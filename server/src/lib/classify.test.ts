import { beforeEach, describe, expect, mock, test } from "bun:test";

// classifyTicketById is the work the `classify-ticket` queue worker runs. The AI
// classifier and the DB are both mocked (BEFORE importing the module under test) so
// nothing reaches OpenAI or a real database.
const classifyTicketMock = mock();
mock.module("./ai", () => ({ classifyTicket: classifyTicketMock }));

const prismaMock = {
  ticket: { findUnique: mock(), updateMany: mock() },
};
mock.module("../db", () => ({ default: prismaMock }));

const { classifyTicketById } = await import("./classify");

beforeEach(() => {
  classifyTicketMock.mockReset();
  prismaMock.ticket.findUnique.mockReset();
  prismaMock.ticket.updateMany.mockReset();
  prismaMock.ticket.findUnique.mockResolvedValue({
    subject: "Cannot log in",
    body: "I get an error every time.",
  });
  classifyTicketMock.mockResolvedValue("technical_question");
  prismaMock.ticket.updateMany.mockResolvedValue({ count: 1 });
});

describe("classifyTicketById", () => {
  test("classifies the ticket and writes the category", async () => {
    await classifyTicketById(103);

    expect(classifyTicketMock).toHaveBeenCalledWith({
      subject: "Cannot log in",
      body: "I get an error every time.",
    });
    expect(prismaMock.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: 103, category: null },
      data: { category: "technical_question" },
    });
  });

  test("only writes the category of a still-unclassified ticket", async () => {
    await classifyTicketById(103);

    // Guarding on category: null means a category an agent set by hand while the job
    // sat in the queue is never clobbered by the slower automatic one.
    expect(prismaMock.ticket.updateMany.mock.calls[0][0].where).toEqual({
      id: 103,
      category: null,
    });
  });

  test("does nothing when the ticket no longer exists", async () => {
    // Deleted between enqueue and processing — return without throwing, so pg-boss
    // doesn't retry a job that can never succeed.
    prismaMock.ticket.findUnique.mockResolvedValue(null);

    await classifyTicketById(103);

    expect(classifyTicketMock).not.toHaveBeenCalled();
    expect(prismaMock.ticket.updateMany).not.toHaveBeenCalled();
  });

  test("propagates a classification failure so the queue can retry", async () => {
    classifyTicketMock.mockRejectedValue(new Error("upstream is down"));

    // Unlike the old fire-and-forget path, the work function must let failures
    // surface — that's what tells pg-boss to retry the job. Settle the rejection
    // explicitly so the "no category written" assertion below can't race it.
    let error: Error | undefined;
    await classifyTicketById(103).catch((caught: Error) => {
      error = caught;
    });

    expect(error?.message).toContain("upstream is down");
    expect(prismaMock.ticket.updateMany).not.toHaveBeenCalled();
  });
});
