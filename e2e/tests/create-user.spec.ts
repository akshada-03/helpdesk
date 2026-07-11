import { test, expect } from "@playwright/test";
import { ADMIN, login } from "../helpers/auth";

// Creating a user is a full-stack flow worth an E2E: the admin submits the
// modal, the client POSTs to the admin-only /api/users, the server writes a
// real User + credential Account to the (test) database, TanStack Query
// invalidates ["users"], and the refetched list must show the new row. Only a
// real browser + API + DB round-trip proves that persistence + refresh path.
// (Form-validation *messages* on their own belong in a component test; the
// invalid-submit case here asserts the end-to-end guard — no row is created.)

test.describe("Create user", () => {
  test("admin creates a user and it appears in the list", async ({ page }) => {
    await login(page, ADMIN);

    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    // Unique per run so re-runs don't collide on the server's 409 duplicate check.
    const suffix = Date.now();
    const name = `Test User ${suffix}`;
    const email = `test-user-${suffix}@example.com`;

    await page.getByRole("button", { name: "New user" }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "New user" })
    ).toBeVisible();

    // The inputs are readOnly until focused (an anti-autofill lock that clears
    // on onFocus), so click each field to unlock it before filling — fill()'s
    // editability check would otherwise time out on the still-readonly input.
    await dialog.getByLabel("Name").click();
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Email").click();
    await dialog.getByLabel("Email").fill(email);
    // Role is a required, click-to-open Select (no readonly lock). Its options
    // render in a page-level portal, so query them via page (not the dialog).
    await dialog.getByLabel("Role").click();
    await page.getByRole("option", { name: "Agent" }).click();
    await dialog.getByLabel("Password").click();
    await dialog.getByLabel("Password").fill("supersecret123");

    await dialog.getByRole("button", { name: "Create user" }).click();

    // On success the modal closes...
    await expect(dialog).toBeHidden();

    // ...and the refreshed list shows the new user as a row (Name + Email cells,
    // role "agent"). Scope the assertion to that row so it's specific.
    const row = page.getByRole("row").filter({ hasText: email });
    await expect(row).toBeVisible();
    await expect(row.getByText(name)).toBeVisible();
    await expect(row.getByText("agent")).toBeVisible();
  });

  test("admin creates a user with the Admin role and the row shows it", async ({
    page,
  }) => {
    await login(page, ADMIN);

    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    const suffix = Date.now();
    const name = `Admin User ${suffix}`;
    const email = `admin-user-${suffix}@example.com`;

    await page.getByRole("button", { name: "New user" }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "New user" })
    ).toBeVisible();

    await dialog.getByLabel("Name").click();
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Email").click();
    await dialog.getByLabel("Email").fill(email);
    // Pick the non-default "Admin" role and confirm it persists onto the row.
    await dialog.getByLabel("Role").click();
    await page.getByRole("option", { name: "Admin" }).click();
    await dialog.getByLabel("Password").click();
    await dialog.getByLabel("Password").fill("supersecret123");

    await dialog.getByRole("button", { name: "Create user" }).click();
    await expect(dialog).toBeHidden();

    const row = page.getByRole("row").filter({ hasText: email });
    await expect(row).toBeVisible();
    await expect(row.getByText(name)).toBeVisible();
    // exact match so the role badge isn't confused with the "admin"-containing
    // name/email cells in the same row (getByText is substring by default).
    await expect(row.getByText("admin", { exact: true })).toBeVisible();
  });

  test("client-side validation blocks an invalid submit and adds no row", async ({
    page,
  }) => {
    await login(page, ADMIN);
    await page.goto("/users");

    // Wait for the real (non-skeleton) table to finish loading before counting —
    // the seeded admin's row is a stable signal that the data has rendered.
    await expect(
      page.getByRole("row").filter({ hasText: ADMIN.email })
    ).toBeVisible();
    const rowsBefore = await page.getByRole("row").count();

    await page.getByRole("button", { name: "New user" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "New user" })
    ).toBeVisible();

    // Valid name/email but a too-short password (< 8 chars) fails the shared
    // createUserSchema, so the client never POSTs.
    // Click each field first to clear the readOnly anti-autofill lock (see the
    // happy-path test) before filling.
    await dialog.getByLabel("Name").click();
    await dialog.getByLabel("Name").fill("Blocked User");
    await dialog.getByLabel("Email").click();
    await dialog.getByLabel("Email").fill(`blocked-${Date.now()}@example.com`);
    // Select a role so the password is the only failing field — isolates the
    // assertion below to the password message.
    await dialog.getByLabel("Role").click();
    await page.getByRole("option", { name: "Agent" }).click();
    await dialog.getByLabel("Password").click();
    await dialog.getByLabel("Password").fill("short");

    await dialog.getByRole("button", { name: "Create user" }).click();

    // The validation message shows and the dialog stays open.
    await expect(
      dialog.getByText("Password must be at least 8 characters")
    ).toBeVisible();
    await expect(dialog).toBeVisible();

    // No row was added: close the modal and confirm the table is unchanged.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("row")).toHaveCount(rowsBefore);
  });
});
