import { test, expect } from "@playwright/test";
import { ADMIN, login } from "../helpers/auth";
import { SERVER_PORT } from "../config";

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
});
