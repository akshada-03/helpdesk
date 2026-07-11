import { test, expect, type Page } from "@playwright/test";
import { ADMIN, login } from "../helpers/auth";

// Happy-path CRUD coverage for the admin-only /users page. Each operation is a
// full-stack flow that only a real browser + API + (test) DB round-trip can
// prove: the client mutates the admin-only /api/users endpoint, the server
// persists to the database, TanStack Query invalidates ["users"], and the
// refetched list must reflect the change. Validation-error, permission-denied,
// and blocked-login cases intentionally live in the dedicated
// create-/edit-/delete-user specs and are not duplicated here.

// Creates a fresh agent user through the real "New user" UI flow so the update
// and delete tests each have a stable, non-admin row to operate on. Returns the
// row locator. (Shared here rather than re-writing the create flow per test.)
async function createAgentUser(
  page: Page,
  name: string,
  email: string,
  password: string
) {
  await page.getByRole("button", { name: "New user" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "New user" })).toBeVisible();

  // The text inputs are readOnly until focused (an anti-autofill lock that
  // clears on onFocus), so click each field to unlock it before filling —
  // fill()'s editability check would otherwise time out on the readonly input.
  await dialog.getByLabel("Name").click();
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Email").click();
  await dialog.getByLabel("Email").fill(email);
  // Role is a required, click-to-open Select (no readonly lock); its options
  // render in a page-level portal, so query them via page (not the dialog).
  await dialog.getByLabel("Role").click();
  await page.getByRole("option", { name: "Agent" }).click();
  await dialog.getByLabel("Password").click();
  await dialog.getByLabel("Password").fill(password);

  await dialog.getByRole("button", { name: "Create user" }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toBeVisible();
  return row;
}

test.describe("User management (admin CRUD)", () => {
  test("Create: admin creates a user and it appears in the list with its role", async ({
    page,
  }) => {
    await login(page, ADMIN);
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    // Unique per run so re-runs don't collide on the server's 409 duplicate check.
    const suffix = Date.now();
    const name = `Created User ${suffix}`;
    const email = `created-user-${suffix}@example.com`;

    await page.getByRole("button", { name: "New user" }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "New user" })
    ).toBeVisible();

    await dialog.getByLabel("Name").click();
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Email").click();
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByLabel("Role").click();
    await page.getByRole("option", { name: "Agent" }).click();
    await dialog.getByLabel("Password").click();
    await dialog.getByLabel("Password").fill("supersecret123");

    await dialog.getByRole("button", { name: "Create user" }).click();

    // On success the modal closes and the refreshed list shows the new row.
    await expect(dialog).toBeHidden();

    const row = page.getByRole("row").filter({ hasText: email });
    await expect(row).toBeVisible();
    await expect(row.getByText(name)).toBeVisible();
    await expect(row.getByText("agent")).toBeVisible();
  });

  test("Read: the users list renders its columns and the seeded admin row", async ({
    page,
  }) => {
    await login(page, ADMIN);
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    // Wait on a success-only signal (the seeded admin's row) before asserting
    // structure, so we're checking the loaded table — not the skeleton, which
    // shares the same column headers.
    const adminRow = page.getByRole("row").filter({ hasText: ADMIN.email });
    await expect(adminRow).toBeVisible();
    // The seed names the admin "Admin"; its role badge reads "admin".
    await expect(adminRow.getByText("Admin", { exact: true })).toBeVisible();
    await expect(adminRow.getByText("admin", { exact: true })).toBeVisible();

    // The table exposes the expected column headers.
    for (const header of ["Name", "Email", "Role", "Joined"]) {
      await expect(
        page.getByRole("columnheader", { name: header })
      ).toBeVisible();
    }
  });

  test("Update: admin renames a user and promotes it to Admin", async ({
    page,
  }) => {
    await login(page, ADMIN);
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    const suffix = Date.now();
    const originalName = `Agent To Promote ${suffix}`;
    const newName = `Promoted User ${suffix}`;
    const email = `update-user-${suffix}@example.com`;

    const row = await createAgentUser(
      page,
      originalName,
      email,
      "supersecret123"
    );
    // exact match: the name ("Agent To Promote…") also contains "agent", so a
    // substring match would collide with the name cell — scope to the badge.
    await expect(row.getByText("agent", { exact: true })).toBeVisible();

    await row.getByRole("button", { name: `Edit ${originalName}` }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Edit user" })
    ).toBeVisible();
    await expect(dialog.getByLabel("Name")).toHaveValue(originalName);
    await expect(dialog.getByLabel("Role")).toHaveText("Agent");

    // Rename (readOnly-until-focused lock, so click before filling)...
    await dialog.getByLabel("Name").click();
    await dialog.getByLabel("Name").fill(newName);
    // ...and switch the role Agent -> Admin (options render in a page portal).
    await dialog.getByLabel("Role").click();
    await page.getByRole("option", { name: "Admin" }).click();

    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();

    // The refetched list reflects both changes on the (email-stable) row.
    const updatedRow = page.getByRole("row").filter({ hasText: email });
    await expect(updatedRow.getByText(newName)).toBeVisible();
    await expect(updatedRow.getByText(originalName)).toBeHidden();
    await expect(updatedRow.getByText("admin", { exact: true })).toBeVisible();
  });

  test("Delete: admin deletes an agent and the row disappears", async ({
    page,
  }) => {
    await login(page, ADMIN);
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    const suffix = Date.now();
    const name = `Agent To Delete ${suffix}`;
    const email = `delete-user-${suffix}@example.com`;

    const row = await createAgentUser(page, name, email, "supersecret123");
    await expect(row.getByText(name)).toBeVisible();

    await row.getByRole("button", { name: `Delete ${name}` }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Delete user" })
    ).toBeVisible();
    await expect(dialog.getByText(name)).toBeVisible();

    // Confirm via the destructive "Delete user" button (distinct from the
    // dialog title, which is a heading, not a button).
    await dialog.getByRole("button", { name: "Delete user" }).click();

    // On success the modal closes and the refetched list drops the row.
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("row").filter({ hasText: email })
    ).toHaveCount(0);
  });
});
