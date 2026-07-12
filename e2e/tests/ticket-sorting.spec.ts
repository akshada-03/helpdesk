import { test, expect, type Page } from "@playwright/test";
import { ADMIN, login } from "../helpers/auth";
import { SERVER_PORT } from "../config";

// Server-side ticket sorting. Only a real browser + API + DB can prove this: the
// client sends sortBy/order query params, the server builds a Prisma orderBy from
// them, and the reordered rows must render in the new order after the refetch.
// The pure pieces (query-schema validation, the header/table wiring) are covered
// by unit/component tests; this spec exercises the full click -> requery -> reorder
// round-trip.
//
// Subject is the deterministic sort key here: the webhook writes the subject
// verbatim, so ascending vs descending order is unambiguous (unlike status or the
// AI-populated category).
const API_URL = `http://localhost:${SERVER_PORT}`;

// Creates a ticket via the public SendGrid inbound-email webhook (the app's real
// ingestion path), matching the seeding pattern in inbound-email-ticket.spec.ts.
async function createTicket(page: Page, subject: string): Promise<void> {
  const response = await page.request.post(
    `${API_URL}/api/webhooks/inbound-email`,
    {
      multipart: {
        from: `Requester <requester@example.com>`,
        subject,
        text: "Please help.",
        envelope: JSON.stringify({
          to: ["support@helpdesk.example.com"],
          from: "requester@example.com",
        }),
      },
    },
  );
  expect(response.status()).toBe(200);
}

// The subject lives in the first cell of every data row, so reading each row's
// first <td> in DOM order gives the rendered row order.
function subjectCells(page: Page) {
  return page.locator("tbody td:first-child");
}

test.describe("Ticket sorting", () => {
  test("clicking the Subject header sorts rows ascending, then descending", async ({
    page,
  }) => {
    // Unique per run so re-runs don't collide and the assertions can isolate the
    // rows this test created from any left over in the shared test DB.
    const suffix = Date.now();
    const alpha = `Alpha subject ${suffix}`;
    const mike = `Mike subject ${suffix}`;
    const zulu = `Zulu subject ${suffix}`;

    // Seed intentionally out of alphabetical order so an accidental insertion-order
    // pass-through wouldn't look sorted.
    await createTicket(page, zulu);
    await createTicket(page, alpha);
    await createTicket(page, mike);

    await login(page, ADMIN);
    await page.goto("/tickets");

    // Only the three rows this run created — filtered by the unique suffix so other
    // specs' tickets in the shared DB don't interfere with the ordered assertion.
    const mySubjects = subjectCells(page).filter({ hasText: String(suffix) });

    // Wait for the table's first page to load before sorting.
    await expect(page.getByText(alpha)).toBeVisible();

    // Ascending: first click on an unsorted column sorts ascending. Assert the
    // outbound request carries the expected params, then assert the rendered order.
    const [ascRequest] = await Promise.all([
      page.waitForRequest(
        (req) =>
          req.url().includes("/api/tickets") &&
          req.url().includes("sortBy=subject") &&
          req.url().includes("order=asc"),
      ),
      page.getByRole("button", { name: "Subject" }).click(),
    ]);
    expect(ascRequest.method()).toBe("GET");

    await expect(mySubjects).toHaveText([alpha, mike, zulu]);

    // Descending: a second click toggles the direction.
    const [descRequest] = await Promise.all([
      page.waitForRequest(
        (req) =>
          req.url().includes("/api/tickets") &&
          req.url().includes("sortBy=subject") &&
          req.url().includes("order=desc"),
      ),
      page.getByRole("button", { name: "Subject" }).click(),
    ]);
    expect(descRequest.method()).toBe("GET");

    await expect(mySubjects).toHaveText([zulu, mike, alpha]);
  });
});
