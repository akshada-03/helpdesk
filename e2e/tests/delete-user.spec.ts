import { test, expect, type Page } from "@playwright/test";
import { ADMIN, login } from "../helpers/auth";

// Deleting a user is a full-stack flow worth an E2E: the admin confirms the
// modal, the client DELETEs the admin-only /api/users/:id, the server soft-
// deletes the real User (stamps deletedAt + revokes sessions) in the (test)
// database, TanStack Query invalidates ["users"], and the refetched list must
// drop the row. The "deleted user can't sign in" case additionally proves the
// server-side session block — Better Auth's session-create hook throws for a
// soft-deleted user, so a later sign-in never reaches the app. Only a real
// browser + API + DB round-trip can verify that persistence + auth path.
// (The soft-delete migration `add_user_soft_delete` is applied to helpdesk_test
// by global-setup's `prisma migrate deploy`, so the DELETE endpoint works.)

// Creates a fresh agent user through the real "New user" UI flow so each delete
// test has a stable, non-admin row to operate on. Returns the row locator.
async function createUser(
  page: Page,
  name: string,
  email: string,
  password: string
) {
  await page.getByRole("button", { name: "New user" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "New user" })).toBeVisible();

  // The inputs are readOnly until focused (an anti-autofill lock that clears on
  // onFocus), so click each field to unlock it before filling — fill()'s
  // editability check would otherwise time out on the still-readonly input.
  await dialog.getByLabel("Name").click();
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Email").click();
  await dialog.getByLabel("Email").fill(email);
  // Role is now required. Default to "Agent" to preserve prior behavior (users
  // were always created as agents). The Select is click-to-open (no readonly
  // lock); its options render in a page-level portal, so query via page.
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

test.describe("Delete user", () => {
  test("admin deletes an agent and the row disappears", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    // Unique per run so re-runs don't collide on the server's 409 duplicate check.
    const suffix = Date.now();
    const name = `Delete Me ${suffix}`;
    const email = `delete-me-${suffix}@example.com`;

    const row = await createUser(page, name, email, "supersecret123");
    await expect(row.getByText(name)).toBeVisible();

    // Open the confirm modal from that user's row via its accessible delete button.
    await row.getByRole("button", { name: `Delete ${name}` }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Delete user" })
    ).toBeVisible();
    // The description names the user being deleted.
    await expect(dialog.getByText(name)).toBeVisible();

    // Confirm via the destructive "Delete user" button (distinct from the
    // dialog title, which is a heading, not a button).
    await dialog.getByRole("button", { name: "Delete user" }).click();

    // On success the modal closes and the refetched list no longer shows the row.
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("row").filter({ hasText: email })
    ).toHaveCount(0);
  });

  test("admin rows have no delete button", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    // The seeded admin's row (scoped by its stable email) — the seed names the
    // admin "Admin".
    const adminRow = page.getByRole("row").filter({ hasText: ADMIN.email });
    await expect(adminRow).toBeVisible();

    // Admins are always editable...
    await expect(
      adminRow.getByRole("button", { name: "Edit Admin" })
    ).toBeVisible();
    // ...but never deletable — the delete button isn't rendered for admin rows.
    await expect(
      adminRow.getByRole("button", { name: "Delete Admin" })
    ).toHaveCount(0);
  });

  test("a deleted user can no longer sign in", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    const suffix = Date.now();
    const name = `Locked Out ${suffix}`;
    const email = `locked-out-${suffix}@example.com`;
    const password = "supersecret123";

    // Create, then soft-delete the agent as admin.
    const row = await createUser(page, name, email, password);
    await row.getByRole("button", { name: `Delete ${name}` }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Delete user" })
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Delete user" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("row").filter({ hasText: email })).toHaveCount(
      0
    );

    // Sign out of the admin session.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/login");

    // Attempt to sign in as the deleted agent with its (correct) password. The
    // server blocks the session, so sign-in must fail — don't use the login()
    // helper here, which asserts a successful redirect to "/".
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    // The user stays on /login, sees the sign-in error alert, and never reaches
    // the authenticated home page.
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL("/login");
    await expect(
      page.getByRole("heading", { name: `Welcome, ${name}` })
    ).toHaveCount(0);
  });
});
