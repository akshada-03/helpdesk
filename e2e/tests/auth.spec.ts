import { test, expect } from "@playwright/test";
import { ADMIN, AGENT, login, seedAgentUser } from "../helpers/auth";

// These flows all require a real browser + server + HttpOnly session cookie:
// the redirects are driven by Better Auth's cross-origin session, the guards
// (ProtectedRoute / AdminRoute) read a live `useSession()`, and persistence
// depends on the actual cookie surviving a full navigation/reload. None of that
// is exercisable in a component test with a mocked session.

test.describe("Login", () => {
  test("admin signs in and lands on an authenticated home view", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByText("Sign in to Helpdesk")).toBeVisible();

    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    // Redirected off /login into the protected app shell.
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: /Welcome, Admin/ })
    ).toBeVisible();
    // Navbar (rendered only inside the authenticated Home) confirms the session.
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("wrong password keeps the user on /login with no session", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Server rejects: an error alert shows and we stay on /login.
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL("/login");

    // No session was established: the protected route still bounces to /login.
    await page.goto("/");
    await expect(page).toHaveURL("/login");
  });

  test("unknown email keeps the user on /login with no session", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("whatever-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("visiting /login while already authenticated redirects to home", async ({
    page,
  }) => {
    await login(page, ADMIN);

    await page.goto("/login");
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: /Welcome, Admin/ })
    ).toBeVisible();
  });
});

test.describe("Route protection (unauthenticated)", () => {
  test("protected home route redirects to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/login");
    await expect(page.getByText("Sign in to Helpdesk")).toBeVisible();
  });

  test("admin-only /users route redirects to /login", async ({ page }) => {
    await page.goto("/users");
    await expect(page).toHaveURL("/login");
  });

  test("unknown route falls through to the guarded home and to /login", async ({
    page,
  }) => {
    await page.goto("/does-not-exist");
    await expect(page).toHaveURL("/login");
  });
});

test.describe("Session persistence", () => {
  test("session survives a full page reload", async ({ page }) => {
    await login(page, ADMIN);
    await expect(
      page.getByRole("heading", { name: /Welcome, Admin/ })
    ).toBeVisible();

    await page.reload();

    // Still authenticated after reload — no bounce back to /login.
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: /Welcome, Admin/ })
    ).toBeVisible();
  });
});

test.describe("Sign out", () => {
  test("signing out returns to /login and re-protects routes", async ({
    page,
  }) => {
    await login(page, ADMIN);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/login");

    // The session is gone: protected + admin routes now bounce to /login.
    await page.goto("/");
    await expect(page).toHaveURL("/login");
    await page.goto("/users");
    await expect(page).toHaveURL("/login");
  });
});

test.describe("Admin-only route (AdminRoute)", () => {
  // The agent user isn't part of the base seed — create it once for this group.
  test.beforeAll(() => {
    seedAgentUser();
  });

  test("admin can reach the /users admin page", async ({ page }) => {
    await login(page, ADMIN);

    await page.goto("/users");
    await expect(page).toHaveURL("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  });

  test("agent is redirected away from /users to home", async ({ page }) => {
    await login(page, AGENT);

    await page.goto("/users");
    // Non-admin: AdminRoute sends them to home instead of the admin page.
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: /Welcome, Agent/ })
    ).toBeVisible();
    // And the admin-only Users nav link is not rendered for an agent.
    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
  });
});
