import { test, expect, type Page } from "@playwright/test";
import { ADMIN, login } from "../helpers/auth";
import { SERVER_PORT } from "../config";

// Ticket detail page (/tickets/:id) full-stack flows. These need a real
// browser + API + DB: the reply thread and the status control each POST/PATCH
// to the server and must survive a refetch/reload (real persistence), and the
// list -> detail hop exercises the protected route + subject link. The purely
// rendered pieces (badges, timestamps, empty/error states, field wiring) are
// already covered by the component tests next to TicketDetail/TicketReplies/
// UpdateTicket, so they aren't re-exercised here.
//
// The browser (client :3000) talks straight to the API (:3001); Better Auth's
// session cookie is scoped to that origin, so after logging in through the UI
// page.request carries the cookie to the API automatically.
const API_URL = `http://localhost:${SERVER_PORT}`;

// The seed names the admin "Admin" (prisma/seed.ts); agent replies posted
// through the UI are authored by the logged-in user, so that's the name the
// reply badge shows.
const ADMIN_NAME = "Admin";

// Creates a ticket via the public SendGrid inbound-email webhook — the app's
// real ingestion path — and returns its id. Tickets are created with status
// `open`, so they're immediately visible in the list and on the detail page.
async function createTicket(
  page: Page,
  subject: string,
): Promise<string> {
  const response = await page.request.post(
    `${API_URL}/api/webhooks/inbound-email`,
    {
      multipart: {
        from: `Requester <requester@example.com>`,
        subject,
        text: "Please help with my issue.",
        envelope: JSON.stringify({
          to: ["support@helpdesk.example.com"],
          from: "requester@example.com",
        }),
      },
    },
  );
  expect(response.status()).toBe(200);
  const { ticketId } = (await response.json()) as { ticketId: string };
  expect(ticketId).toBeTruthy();
  return ticketId;
}

test.describe("Ticket detail — reply thread", () => {
  test("navigates from the list, posts a reply, and clears the box", async ({
    page,
  }) => {
    const suffix = Date.now();
    const subject = `Reply flow ticket ${suffix}`;
    const replyBody = `Thanks for reaching out — we're on it ${suffix}`;

    await createTicket(page, subject);
    await login(page, ADMIN);

    // Reach the detail page the way an agent does: from the tickets list by
    // clicking the ticket's subject link (exercises the protected route + hop).
    await page.goto("/tickets");
    await page.getByRole("link", { name: subject }).click();
    await expect(page).toHaveURL(/\/tickets\/[0-9a-f-]+$/);
    // Subject renders as the detail card's title, confirming the detail loaded.
    await expect(page.getByText(subject)).toBeVisible();

    // Empty thread to start.
    await expect(page.getByText("No replies yet.")).toBeVisible();

    // Post a reply through the compose form.
    await page.getByLabel("Reply message").fill(replyBody);
    await page.getByRole("button", { name: "Send reply" }).click();

    // The reply persists and comes back through the refetched thread: the body,
    // the Agent badge, and the authoring user's name all render together.
    const reply = page
      .getByText(replyBody, { exact: true })
      .locator("xpath=ancestor::div[1]");
    await expect(reply).toBeVisible();
    await expect(reply.getByText("Agent")).toBeVisible();
    await expect(reply.getByText(ADMIN_NAME)).toBeVisible();

    // Empty-state text is gone and the compose box is cleared for the next reply.
    await expect(page.getByText("No replies yet.")).toHaveCount(0);
    await expect(page.getByLabel("Reply message")).toHaveValue("");
  });
});

test.describe("Ticket detail — update controls", () => {
  test("changing the status persists across a reload", async ({ page }) => {
    const suffix = Date.now();
    const subject = `Status update ticket ${suffix}`;

    const ticketId = await createTicket(page, subject);
    await login(page, ADMIN);
    await page.goto(`/tickets/${ticketId}`);

    const status = page.getByRole("combobox", { name: "Update status" });
    // Created as `open`, so the control starts on Open.
    await expect(status).toContainText("Open");

    // Change to Resolved via the select.
    await status.click();
    await page.getByRole("option", { name: "Resolved" }).click();

    // The trigger only shows the new label once the PATCH succeeds and the
    // ticket cache is updated — so this confirms the write round-tripped.
    await expect(status).toContainText("Resolved");

    // Reload from the server: the new status must have been persisted, not just
    // reflected in the in-memory cache.
    await page.reload();
    await expect(
      page.getByRole("combobox", { name: "Update status" }),
    ).toContainText("Resolved");
  });
});
