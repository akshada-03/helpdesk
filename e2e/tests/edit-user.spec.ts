import { test, expect, type Page } from "@playwright/test";
import { ADMIN, login } from "../helpers/auth";

// Editing a user is a full-stack flow worth an E2E: the admin submits the edit
// dialog, the client PATCHes the admin-only /api/users/:id, the server updates
// the real User (and, when a password is supplied, re-hashes the credential
// Account) in the (test) database, TanStack Query invalidates ["users"], and
// the refetched list must reflect the change. The password case additionally
// proves the new credential works by logging in with it — only a real browser +
// API + DB round-trip can verify that end-to-end persistence + refresh path.
// (Form-validation *messages* on their own belong in a component test.)

// Creates a fresh agent user through the real "New user" UI flow so each edit
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

test.describe("Edit user", () => {
  test("admin edits a user's name and the row updates", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    // Unique per run so re-runs don't collide on the server's 409 duplicate check.
    const suffix = Date.now();
    const email = `edit-name-${suffix}@example.com`;
    const originalName = `Original Name ${suffix}`;
    const newName = `Renamed User ${suffix}`;

    const row = await createUser(page, originalName, email, "supersecret123");
    await expect(row.getByText(originalName)).toBeVisible();

    // Open the edit dialog from that user's row via its accessible edit button.
    await row.getByRole("button", { name: `Edit ${originalName}` }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Edit user" })
    ).toBeVisible();

    // Name/Email are pre-populated with the current values.
    await expect(dialog.getByLabel("Name")).toHaveValue(originalName);
    await expect(dialog.getByLabel("Email")).toHaveValue(email);

    // Same readOnly-until-focused lock as create — click before filling.
    await dialog.getByLabel("Name").click();
    await dialog.getByLabel("Name").fill(newName);

    await dialog.getByRole("button", { name: "Save changes" }).click();

    // On success the dialog closes and the refetched list shows the new name.
    await expect(dialog).toBeHidden();

    // Re-scope to the (email-stable) row and confirm the rename took effect.
    const updatedRow = page.getByRole("row").filter({ hasText: email });
    await expect(updatedRow.getByText(newName)).toBeVisible();
    await expect(updatedRow.getByText(originalName)).toBeHidden();
  });

  test("admin changes a user's role to Admin and the row's badge updates", async ({
    page,
  }) => {
    await login(page, ADMIN);
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    // Unique per run so re-runs don't collide on the server's 409 duplicate check.
    const suffix = Date.now();
    const name = `Role Change ${suffix}`;
    const email = `edit-role-${suffix}@example.com`;

    // Created as an agent by the helper.
    const row = await createUser(page, name, email, "supersecret123");
    await expect(row.getByText("agent")).toBeVisible();

    await row.getByRole("button", { name: `Edit ${name}` }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Edit user" })
    ).toBeVisible();

    // The Role select is pre-populated with the user's current role ("Agent").
    await expect(dialog.getByLabel("Role")).toHaveText("Agent");

    // Change it to Admin. Options render in a page-level portal.
    await dialog.getByLabel("Role").click();
    await page.getByRole("option", { name: "Admin" }).click();

    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();

    // The refetched list shows the promoted role on the (email-stable) row.
    const updatedRow = page.getByRole("row").filter({ hasText: email });
    await expect(updatedRow.getByText("admin")).toBeVisible();
  });

  test("admin changes a user's password and the new password works", async ({
    page,
  }) => {
    await login(page, ADMIN);
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    const suffix = Date.now();
    const name = `Password User ${suffix}`;
    const email = `edit-password-${suffix}@example.com`;
    const oldPassword = "originalpass123";
    const newPassword = "brandnewpass456";

    const row = await createUser(page, name, email, oldPassword);

    // Open the edit dialog and set a fresh password (>= 8 chars). Leaving Name
    // and Email as-is; only the password changes.
    await row.getByRole("button", { name: `Edit ${name}` }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Edit user" })
    ).toBeVisible();

    // Password starts blank in edit mode; fill it to reset the credential.
    await expect(dialog.getByLabel("New password")).toHaveValue("");
    await dialog.getByLabel("New password").click();
    await dialog.getByLabel("New password").fill(newPassword);

    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();

    // Prove the change persisted end-to-end: sign out of the admin session and
    // sign in as the edited user with the NEW password.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/login");

    await login(page, { email, password: newPassword });
    // login() already asserts the post-login redirect to "/", confirming the
    // new credential is accepted (the old one would have failed to sign in).
    // The home page greets the signed-in user by name, proving whose session it is.
    await expect(
      page.getByRole("heading", { name: `Welcome, ${name}` })
    ).toBeVisible();
  });
});
