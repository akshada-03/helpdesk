import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { ADMIN, login } from "../helpers/auth";
import { SERVER_PORT, TEST_DATABASE_URL } from "../config";

// Inbound email -> ticket is a genuine full-stack flow that only a real server +
// DB can prove: the PUBLIC SendGrid webhook parses a multipart payload, writes a
// real Ticket row (status open, category null, requester derived from the
// envelope/From header), and that row must then surface through the
// authenticated GET /api/tickets read. Component tests can't exercise the
// multipart parse -> Prisma write -> authenticated read round-trip, so this
// warrants an E2E.
//
// The browser (client on :3000) talks directly to the API on :3001, and Better
// Auth's session cookie is scoped to that origin — so after logging in through
// the UI, page.request carries the cookie to the API automatically.
const API_URL = `http://localhost:${SERVER_PORT}`;

type TicketListItem = {
  id: string;
  subject: string;
  requesterEmail: string;
  requesterName: string | null;
  status: string;
  category: string | null;
  createdAt: string;
};

// POST the inbound email exactly as SendGrid Inbound Parse would: public
// endpoint, multipart form fields, no auth.
function postInboundEmail(page: Page, fields: Record<string, string>) {
  return page.request.post(`${API_URL}/api/webhooks/inbound-email`, {
    multipart: fields,
  });
}

// Reads the ticket list through the authenticated API. Assumes `page` already
// holds an admin session cookie (call `login` first).
async function fetchTickets(page: Page): Promise<TicketListItem[]> {
  const response = await page.request.get(`${API_URL}/api/tickets`);
  expect(response.ok()).toBe(true);
  const { tickets } = (await response.json()) as { tickets: TicketListItem[] };
  return tickets;
}

// The ticket `body` is not exposed by any API (GET /api/tickets omits it and
// there's no detail route), so the only way to assert the html->text conversion
// is a direct read from the test database.
async function readTicketBody(ticketId: string): Promise<string | null> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ body: string }>(
      "SELECT body FROM ticket WHERE id = $1",
      [ticketId]
    );
    return rows[0]?.body ?? null;
  } finally {
    await client.end();
  }
}

test.describe("Inbound email to ticket", () => {
  test("webhook creates a ticket that appears in GET /api/tickets", async ({
    page,
  }) => {
    // Unique per run so the assertions are specific and re-runs don't collide.
    const suffix = Date.now();
    const requesterEmail = `jane+${suffix}@example.com`;
    const subject = `Help with my order ${suffix}`;
    const displayName = "Jane Doe";

    // 1. POST the inbound email as SendGrid Inbound Parse would: multipart form
    //    fields, no auth. The envelope.from is the authoritative sender address.
    const webhookResponse = await page.request.post(
      `${API_URL}/api/webhooks/inbound-email`,
      {
        multipart: {
          from: `${displayName} <${requesterEmail}>`,
          subject,
          text: "My order never arrived. Please help!",
          envelope: JSON.stringify({
            to: ["support@helpdesk.example.com"],
            from: requesterEmail,
          }),
        },
      }
    );

    expect(webhookResponse.status()).toBe(200);
    const { ticketId } = (await webhookResponse.json()) as {
      ticketId: string;
    };
    expect(ticketId).toBeTruthy();

    // 2. Log in as admin so the browser context holds the session cookie, then
    //    read the ticket list through the authenticated API.
    await login(page, ADMIN);

    const listResponse = await page.request.get(`${API_URL}/api/tickets`);
    expect(listResponse.ok()).toBe(true);

    const { tickets } = (await listResponse.json()) as {
      tickets: Array<{
        id: string;
        subject: string;
        requesterEmail: string;
        requesterName: string | null;
        status: string;
        category: string | null;
        createdAt: string;
      }>;
    };

    const ticket = tickets.find((t) => t.id === ticketId);
    expect(ticket, "created ticket should be present in the list").toBeDefined();

    expect(ticket!.subject).toBe(subject);
    expect(ticket!.requesterEmail).toBe(requesterEmail);
    expect(ticket!.requesterName).toBe(displayName);
    expect(ticket!.status).toBe("open");
    expect(ticket!.category).toBeNull();
  });

  // A bare From address with no envelope: the requester email must be parsed
  // straight from the From header, and there is no display name to derive.
  test("bare From address with no envelope yields email from From and null name", async ({
    page,
  }) => {
    const suffix = Date.now();
    const requesterEmail = `someone+${suffix}@example.com`;
    const subject = `Bare address ${suffix}`;

    const webhookResponse = await postInboundEmail(page, {
      from: requesterEmail,
      subject,
      text: "No envelope on this one.",
    });

    expect(webhookResponse.status()).toBe(200);
    const { ticketId } = (await webhookResponse.json()) as { ticketId: string };
    expect(ticketId).toBeTruthy();

    await login(page, ADMIN);
    const ticket = (await fetchTickets(page)).find((t) => t.id === ticketId);
    expect(ticket, "created ticket should be present").toBeDefined();

    expect(ticket!.requesterEmail).toBe(requesterEmail);
    expect(ticket!.requesterName).toBeNull();
    expect(ticket!.subject).toBe(subject);
    expect(ticket!.status).toBe("open");
  });

  // The envelope sender (SMTP MAIL FROM) is authoritative for the address, so it
  // must override the address in the From header — while the display name still
  // comes from the From header.
  test("envelope.from overrides the From header address", async ({ page }) => {
    const suffix = Date.now();
    const displayName = "Jane Doe";
    const headerEmail = `display+${suffix}@example.com`;
    const envelopeEmail = `envelope+${suffix}@example.com`;
    const subject = `Envelope override ${suffix}`;

    const webhookResponse = await postInboundEmail(page, {
      from: `${displayName} <${headerEmail}>`,
      subject,
      text: "Which address wins?",
      envelope: JSON.stringify({
        to: ["support@helpdesk.example.com"],
        from: envelopeEmail,
      }),
    });

    expect(webhookResponse.status()).toBe(200);
    const { ticketId } = (await webhookResponse.json()) as { ticketId: string };

    await login(page, ADMIN);
    const ticket = (await fetchTickets(page)).find((t) => t.id === ticketId);
    expect(ticket, "created ticket should be present").toBeDefined();

    expect(ticket!.requesterEmail).toBe(envelopeEmail);
    expect(ticket!.requesterName).toBe(displayName);
  });

  // Omitting the subject falls back to the "(no subject)" placeholder.
  test("missing subject falls back to (no subject)", async ({ page }) => {
    const suffix = Date.now();
    const requesterEmail = `nosubject+${suffix}@example.com`;

    const webhookResponse = await postInboundEmail(page, {
      from: requesterEmail,
      text: `Body marker ${suffix}`,
    });

    expect(webhookResponse.status()).toBe(200);
    const { ticketId } = (await webhookResponse.json()) as { ticketId: string };

    await login(page, ADMIN);
    const ticket = (await fetchTickets(page)).find((t) => t.id === ticketId);
    expect(ticket, "created ticket should be present").toBeDefined();

    expect(ticket!.subject).toBe("(no subject)");
    expect(ticket!.requesterEmail).toBe(requesterEmail);
  });

  // With no text/plain part, the body is derived from the HTML by stripping
  // tags. GET /api/tickets doesn't expose body, so this is asserted against the
  // test DB directly.
  test("html-only email stores tag-stripped text as the body", async ({
    page,
  }) => {
    const suffix = Date.now();
    const requesterEmail = `htmlonly+${suffix}@example.com`;
    const subject = `HTML only ${suffix}`;

    const webhookResponse = await postInboundEmail(page, {
      from: requesterEmail,
      subject,
      html: "<p>Hello <b>there</b></p>",
    });

    expect(webhookResponse.status()).toBe(200);
    const { ticketId } = (await webhookResponse.json()) as { ticketId: string };
    expect(ticketId).toBeTruthy();

    expect(await readTicketBody(ticketId)).toBe("Hello there");
  });

  // Missing the required `from` field is a validation failure: 400 with an
  // error, and no ticket is written.
  test("missing From returns 400 and creates no ticket", async ({ page }) => {
    const suffix = Date.now();
    const subject = `Missing from ${suffix}`;

    const webhookResponse = await postInboundEmail(page, {
      subject,
      text: "This one has no sender.",
    });

    expect(webhookResponse.status()).toBe(400);
    const payload = (await webhookResponse.json()) as { error?: string };
    expect(payload.error).toBeTruthy();

    await login(page, ADMIN);
    const match = (await fetchTickets(page)).find((t) => t.subject === subject);
    expect(match, "no ticket should be created on validation failure").toBeUndefined();
  });
});
