import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Resolve paths relative to this file so config works regardless of the CWD
// Playwright is invoked from.
const here = path.dirname(fileURLToPath(import.meta.url));

// Load e2e-local overrides (e.g. TEST_DATABASE_URL) from e2e/.env if present.
dotenv.config({ path: path.join(here, ".env") });

// The E2E suite runs against a DEDICATED test database so it can freely create,
// migrate, truncate, and seed data without touching the developer's `helpdesk`
// database. Override via e2e/.env (see .env.example).
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:root@localhost:5432/helpdesk_test?schema=public";

// The app runs on its normal dev ports; only the database is swapped out. This
// keeps the hardcoded client API_URL (localhost:3001) and Better Auth origins
// working without a rebuild.
export const SERVER_PORT = 3001;
export const CLIENT_PORT = 3000;
export const BASE_URL = `http://localhost:${CLIENT_PORT}`;

export const serverDir = path.resolve(here, "../server");
export const clientDir = path.resolve(here, "../client");
