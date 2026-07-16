import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock pg-boss so these tests never touch Postgres. They assert how we CONFIGURE the
// queue (retry policy, worker registration) and the never-throw enqueue contract the
// webhook relies on — not pg-boss's own runtime behavior, which is its to test.
//
// A single shared instance stands in for the PgBoss object; the mocked constructor
// (pg-boss's named `PgBoss` export) returns it.
// The mock implementations carry the real argument shapes so `.mock.calls` is typed
// (bun infers a zero-arg signature from `mock(() => {})`, which makes the tuples we
// destructure below empty).
type WorkHandler = (jobs: { data: { ticketId: number } }[]) => Promise<void>;
const instance = {
  on: mock((_event: string, _handler: (error: unknown) => void) => {}),
  start: mock(async () => {}),
  createQueue: mock(async (_name: string, _options?: unknown) => {}),
  work: mock(async (_name: string, _handler: WorkHandler) => "worker-id"),
  send: mock(async (_name: string, _data?: unknown) => "job-id"),
  stop: mock(async () => {}),
};
const PgBossMock = mock(function () {
  return instance;
});
mock.module("pg-boss", () => ({ PgBoss: PgBossMock }));

// The worker delegates to classifyTicketById; mock it so no DB/AI is involved.
const classifyTicketByIdMock = mock(async () => {});
mock.module("./classify", () => ({
  classifyTicketById: classifyTicketByIdMock,
}));

// queue.ts reads the connection string straight from process.env (like db.ts). Pin
// it to a fake so the constructor assertion is deterministic and no real URL leaks
// into the test; nothing here actually connects (PgBoss is mocked).
process.env.DATABASE_URL = "postgres://test/db";

const { startQueue, stopQueue, sendClassifyTicketJob } = await import(
  "./queue"
);

beforeEach(() => {
  instance.on.mockClear();
  instance.start.mockClear();
  instance.createQueue.mockClear();
  instance.work.mockClear();
  instance.send.mockClear();
  instance.stop.mockClear();
  classifyTicketByIdMock.mockClear();
});

describe("startQueue", () => {
  test("starts pg-boss with the configured connection string", async () => {
    await startQueue();

    expect(PgBossMock).toHaveBeenCalledWith("postgres://test/db");
    expect(instance.start).toHaveBeenCalled();
  });

  test("registers an error listener so background errors don't crash the process", async () => {
    await startQueue();

    expect(instance.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  test("creates the classify-ticket queue with a bounded retry+backoff policy", async () => {
    await startQueue();

    const [name, policy] = instance.createQueue.mock.calls[0];
    expect(name).toBe("classify-ticket");
    expect(policy).toEqual({
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
    });
  });

  test("registers a worker that classifies the job's ticket", async () => {
    await startQueue();

    const [name, handler] = instance.work.mock.calls[0];
    expect(name).toBe("classify-ticket");

    // Drive the registered handler with a pg-boss-shaped batch (one job).
    await handler([{ data: { ticketId: 42 } }]);
    expect(classifyTicketByIdMock).toHaveBeenCalledWith(42);
  });
});

describe("sendClassifyTicketJob", () => {
  test("enqueues the ticket id on the classify-ticket queue", async () => {
    await startQueue();
    instance.send.mockClear();

    await sendClassifyTicketJob(77);

    expect(instance.send).toHaveBeenCalledWith("classify-ticket", {
      ticketId: 77,
    });
  });

  test("never throws when the enqueue itself fails", async () => {
    await startQueue();
    instance.send.mockRejectedValueOnce(new Error("db down"));

    // The webhook awaits this before responding; a throw here would become a
    // non-2xx that makes the email provider redeliver and duplicate the ticket.
    expect(sendClassifyTicketJob(77)).resolves.toBeUndefined();
  });
});

describe("stopQueue", () => {
  test("stops the queue gracefully", async () => {
    await startQueue();
    await stopQueue();

    expect(instance.stop).toHaveBeenCalled();
  });
});
