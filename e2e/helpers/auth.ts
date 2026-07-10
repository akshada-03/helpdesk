import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import { expect, type Page } from "@playwright/test";
import { TEST_DATABASE_URL, serverDir } from "../config";

const here = path.dirname(fileURLToPath(import.meta.url));

// The seeded admin's credentials come from server/.env (SEED_ADMIN_EMAIL /
// SEED_ADMIN_PASSWORD) — the same source global-setup uses to seed the admin.
// Load it here so tests never hardcode credentials that could drift from the seed.
dotenv.config({ path: path.join(serverDir, ".env") });

export type Credentials = { email: string; password: string };

export const ADMIN: Credentials = {
  email: process.env.SEED_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.SEED_ADMIN_PASSWORD ?? "password123",
};

// The agent user is not seeded by global-setup; tests create it on demand via
// seedAgentUser(). These creds are e2e-owned (not from server/.env).
export const AGENT: Credentials = {
  email: "agent@example.com",
  password: "agent-password123",
};

// Creates (idempotently) a role=agent user in the TEST database by running the
// bun seed script under the SERVER workspace, so it uses the app's real Prisma
// client + Better Auth password hasher and the login flow accepts it.
export function seedAgentUser(): void {
  const result = spawnSync(
    "bun",
    [path.join(here, "..", "scripts", "seed-agent-user.ts")],
    {
      cwd: serverDir,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        DATABASE_URL: TEST_DATABASE_URL,
        NODE_ENV: "test",
        E2E_AGENT_EMAIL: AGENT.email,
        E2E_AGENT_PASSWORD: AGENT.password,
      },
    }
  );
  if (result.status !== 0) {
    throw new Error(`[e2e] Failed to seed agent user (exit ${result.status}).`);
  }
}

// Logs in through the real UI and waits for the post-login redirect to "/".
// Use for tests that need an authenticated session but aren't testing login itself.
export async function login(page: Page, creds: Credentials): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}
