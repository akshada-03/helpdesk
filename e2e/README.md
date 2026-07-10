# E2E Tests (Playwright)

End-to-end tests that drive a real browser against the real client + API, backed
by a **dedicated test database** so runs never touch your dev `helpdesk` data.

## How it works

- `playwright.config.ts` boots the API (`bun src/index.ts`) and client
  (`bun serve.ts`) on the normal dev ports (3001 / 3000), but overrides
  `DATABASE_URL` to point at the test database. All other env (auth secret, seed
  admin creds) is loaded from `server/.env` by Bun.
- `global-setup.ts` runs once before the suite: it creates the test database if
  missing, applies Prisma migrations (`prisma migrate deploy`), and seeds the
  admin user.
- `config.ts` centralizes the test DB URL and ports. Override the DB URL via
  `e2e/.env` (copy `.env.example`).

## Prerequisites

- A local PostgreSQL matching the credentials in `e2e/.env`.
- Browsers installed: `npm run install:browsers` (or `npx playwright install`).
- **Stop any dev servers on ports 3000/3001** — the config uses
  `reuseExistingServer: false` so it always starts fresh servers wired to the
  test database (never your dev database).

## Running

```bash
# From the repo root
npm run test:e2e

# Or from this directory
npm test              # headless
npm run test:ui       # Playwright UI mode
npm run test:headed   # headed browser
npm run report        # open the last HTML report
```

## Writing tests

Place specs in `e2e/tests/*.spec.ts`. Reserve E2E for things that truly need a
real browser + server (auth redirects, navigation, full-stack flows). Use client
component tests for rendering/validation/display logic.
