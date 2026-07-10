import { defineConfig, devices } from "@playwright/test";
import {
  BASE_URL,
  CLIENT_PORT,
  SERVER_PORT,
  TEST_DATABASE_URL,
  clientDir,
  serverDir,
} from "./config";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests",
  // E2E flows share one database, so run serially to keep state predictable.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["html"], ["list"]] : "list",

  // Provisions the test database (create if missing, migrate, seed) before the
  // suite runs. See global-setup.ts.
  globalSetup: "./global-setup.ts",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Boot the real API and client, but point the API at the isolated test
  // database via DATABASE_URL. All other env (auth secret, seed creds, etc.)
  // is loaded from server/.env by Bun. `reuseExistingServer: false` guarantees
  // we never accidentally test against a dev server wired to the real database.
  webServer: [
    {
      command: "bun src/index.ts",
      cwd: serverDir,
      port: SERVER_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        DATABASE_URL: TEST_DATABASE_URL,
        NODE_ENV: "test",
        PORT: String(SERVER_PORT),
      },
    },
    {
      command: "bun serve.ts",
      cwd: clientDir,
      port: CLIENT_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        // Production mode disables HMR/websockets for a stable test target.
        NODE_ENV: "production",
        PORT: String(CLIENT_PORT),
      },
    },
  ],
});
