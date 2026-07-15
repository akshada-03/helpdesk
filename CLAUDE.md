# Helpdesk - AI-Powered Ticket Management System

## Project Overview

A ticket management system that uses AI to classify, respond to, and route support tickets. See `project-scope.md` for full requirements and `implementation-plan.md` for phased task breakdown.

## Tech Stack

- **Frontend**: React + TypeScript + Vite (port 5173) + shadcn/ui
- **Backend**: Express 5 + TypeScript + Bun (port 3000)
- **Database**: PostgreSQL with Prisma ORM
- **AI**: Vercel AI SDK against any OpenAI-compatible endpoint (`@ai-sdk/openai-compatible`), configured entirely by env — `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` (see `server/.env.example`; currently Google Gemini's OpenAI-compat endpoint). Provider and model are config, not code: features call the helpers exported from `server/src/lib/ai.ts` (e.g. `polishReply`) and never construct a model themselves. AI is optional — the app boots and runs without it; only the reply polisher needs a key.
- **Auth**: Better Auth (email/password, database sessions)
- **Job Queue**: pg-boss (PostgreSQL-backed, runs in `pgboss` schema)

## Project Structure

```
/core     - Shared code (Zod schemas, types) — Bun workspace package
/client   - React frontend (Vite)
/server   - Express backend
/e2e      - Playwright E2E tests
```

## Development

```bash
# Start server
cd server && bun run dev

# Start client
cd client && bun run dev
```

The client proxies `/api/*` requests to the server via Vite config (target is configurable via `VITE_API_URL` env var, defaults to `http://localhost:3000`).

## Key Conventions

- Use Bun as the runtime and package manager (not npm/yarn)
- Use TypeScript throughout
- Use context7 MCP server to fetch up-to-date documentation for libraries
- Use shadcn/ui components for all UI (import from `@/components/ui/*`)
- Use the `@/` path alias for imports (maps to `./src/`)
- Use shadcn's semantic color tokens (e.g. `bg-background`, `text-muted-foreground`, `text-destructive`) instead of hardcoded Tailwind colors
- Organize server endpoints into Express `Router` modules under `server/src/routes/` (e.g. `routes/users.ts`), mounted in `index.ts`
- Define shared Zod schemas in the `core` package under `core/schemas/` (e.g. `core/schemas/users.ts`) and import them in both client and server (e.g. `import { createUserSchema } from "core/schemas/users"`)
- Use Zod for all data validation — request bodies, form inputs, and any external or untrusted data. Do not hand-roll ad-hoc validation (manual `typeof`/`if` checks, regex-only guards). Import from `zod/v4`; `zod` is a dependency of the `client`, `core`, and `server` packages. Define the schema once (shared schemas live in `core/schemas/`, see above) and reuse it on both the client (via `zodResolver`) and the server (via the `validate` helper).
- Validate request bodies in route handlers using the shared `validate` helper (`import { validate } from "../lib/validate"`). It takes a Zod schema, the request body, and the `res` object — returns parsed data or `null` (after sending a 400 response).
- Parse and validate numeric ID route params with the shared `parseId` helper (`import { parseId } from "../lib/parse-id"`). Returns a positive integer or `null` for invalid values.
- Do not wrap async route handlers in try/catch — the project runs Express 5, which automatically forwards rejected promises from async handlers to the error middleware. Just `await` and let it throw (e.g. `POST /api/users` in `routes/users.ts` has no try/catch). Note this is an Express **5** behavior only; it does not work on Express 4.
- Route paths use the Express 5 (path-to-regexp v8) matcher: wildcards must be **named** — use `/api/auth/{*any}` (or `*splat`), never a bare `*` (which throws at boot)
- Use the shared `Role` constant instead of hardcoded `"admin"` / `"agent"` strings (import from `core/constants/role.ts`, e.g. `import { Role } from "core/constants/role.ts"`). This applies **everywhere in the client** — components, route guards, form/select option values, **and tests** (fixtures, request-payload assertions, and rendered-badge assertions like `getByText(Role.agent)`). Reference `Role.admin` / `Role.agent`, never the bare literals.
- Define shared domain value types in `core/constants/` as **plain union types** by default — e.g. `type TicketStatus = "open" | "resolved" | "closed"` and `TicketCategory` (both in `core/constants/ticket.ts`). Only use an `as const` object when you actually need the values at runtime (e.g. `Role`, referenced as `Role.admin`); its value type is still a string-literal union. **Never use a TypeScript `enum`**: it's a nominal type, so Prisma's generated string values (and other plain strings) aren't assignable to it without casts, whereas a union / `as const` is structural and assigns cleanly. (This is the real reason — not `erasableSyntaxOnly`, which isn't enabled in any tsconfig.)
- Use React Hook Form with Zod resolver for client-side form validation (`useForm` + `zodResolver` from `@hookform/resolvers/zod`). Adding a new user is the reference implementation: `CreateUserDialog` (`client/src/components/CreateUserDialog.tsx`) wires `useForm` + `zodResolver(createUserSchema)` (the shared schema from `core/schemas/users.ts`) to a shadcn `Dialog`/`Form`, submits via a TanStack `useMutation` that POSTs `/api/users`, and the server re-validates the same schema with the `validate` helper. Model new create/edit forms on it.
- Use Axios for HTTP requests (not `fetch`)
- Use TanStack React Query (`useQuery`, `useMutation`) for server state management (not `useEffect` + `useState`)
- Use the `ErrorAlert` component for error messages (`import ErrorAlert from "@/components/ErrorAlert"`). For static messages: `<ErrorAlert message="Failed to load data" />`. For mutation/query errors with automatic Axios message extraction: `<ErrorAlert error={mutation.error} fallback="Failed to save" />`.
- Use the `ErrorMessage` component for field validation errors (`import ErrorMessage from "@/components/ErrorMessage"`): `{errors.name && <ErrorMessage message={errors.name.message} />}`

## Job Queue (pg-boss)

- **Config**: `server/src/lib/queue.ts` — creates pg-boss instance using `DATABASE_URL`
- pg-boss auto-creates its own `pgboss` schema in PostgreSQL (no Prisma migration needed)
- `startQueue()` is called before `app.listen()` in the async `boot()` function in `index.ts`
- `stopQueue()` is called on `SIGTERM`/`SIGINT` for graceful shutdown
- To add a new background job: create a queue with `boss.createQueue()`, register a worker with `boss.work()` in `startQueue()`, and export a `send*Job()` function
- **Existing queues**:
  - `classify-ticket` — classifies inbound tickets via GPT (retryLimit: 3, retryDelay: 30s, exponential backoff)
  - `auto-resolve-ticket` — attempts to auto-resolve tickets via GPT; if unsuccessful, transitions status to `open`

## Ticket Lifecycle

- Inbound emails arrive via the `/api/webhooks/inbound-email` endpoint (SendGrid multipart format) and are created with status `new`
- The system enqueues `classify-ticket` and `auto-resolve-ticket` background jobs automatically
- Status flow: `new` → `processing` (AI working) → `open` (if not auto-resolved) or `resolved` (if auto-resolved)
- `new` and `processing` tickets are system-managed and never shown in the agent UI — agents only see `open`, `resolved`, and `closed` tickets
- The `/api/tickets` endpoint excludes `new` and `processing` tickets by default (no `status` filter param)

## Authentication

- **Library**: Better Auth with Prisma adapter (email/password, database-backed sessions)
- **Server config**: `server/src/lib/auth.ts` — mounted at `/api/auth/{*any}` in `index.ts` (must be registered **before** `express.json()` so Better Auth does its own body parsing)
- **Cross-origin**: the client (`:3000`) and API (`:3001`) are different origins, so auth requests are cross-origin. Both sides must be configured or sign-in fails:
  - Server: `trustedOrigins: [process.env.CLIENT_URL]` in `auth.ts` **and** CORS `credentials: true` in `index.ts`. Without the trusted origin, `POST /api/auth/sign-in/email` returns `403 INVALID_ORIGIN`.
  - Client: the auth client's `baseURL` points at the API (`http://localhost:3001`) with `fetchOptions: { credentials: "include" }`; the shared Axios instance (`client/src/lib/api.ts`) sets `withCredentials: true`.
  - The `CLIENT_URL` env var (see `server/.env.example`) drives **both** the CORS origin and `trustedOrigins` — keep them in sync.
- **Client config**: `client/src/lib/auth-client.ts` — `createAuthClient` exporting `signIn`, `signOut`, `useSession`. Registers the `inferAdditionalFields` plugin so `session.user.role` is typed.
- **Login flow**: call `signIn.email({ email, password })`, then redirect to `/` on success. The session persists via an HttpOnly cookie; `useSession()` returns `{ data: session, isPending }` (render a spinner while `isPending`, treat `!session` as logged out).
- **Middleware**: `server/src/middleware/require-auth.ts` — `requireAuth` guard that sets `req.user` and `req.session`
- **Route protection (client)**: `ProtectedRoute` wraps authenticated routes (via `useSession()`); redirects to `/login` if unauthenticated
- **Admin route protection (client)**: `AdminRoute` wraps admin-only routes; checks `session.user.role === Role.admin` (shared `Role` constant from `core/constants/role.ts`) and redirects non-admins to `/`
- **Sign-up is disabled** (`emailAndPassword.disableSignUp: true`) — users are seeded via `prisma/seed.ts` (admin credentials come from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`)
- **User roles**: `admin` and `agent` (Prisma enum, default `agent`; `input: false` on the Better Auth field so it can't be set via the API)
- **Rate limiting**: Auth routes are rate-limited, but only enforced when `NODE_ENV=production`

## Testing

- **Prefer component tests** for the majority of coverage (rendering, states, data display, error handling). Reserve E2E tests for things that truly need a real browser + server: navigation, auth redirects, and full-stack integration flows (e.g. webhook creates data that appears in the UI).
- **Write an E2E test only for behavior a component/unit test cannot cover.** Before adding (or keeping) an E2E test, ask whether a component test already exercises the same behavior — client-side form validation, rendering, loading/empty/error states, and asserting a mocked request payload all belong in component tests. An E2E test earns its place only when it verifies something a mocked-axios component test structurally can't: real cross-page navigation, auth/route protection, or true persistence across a server round-trip or page reload (data actually written to the DB and read back). If an E2E test's behavior is already (or could be) covered by a component test, delete it rather than duplicating the coverage.

### Component Tests

- **Framework**: Vitest + React Testing Library, running in a `jsdom` environment. Config lives in `client/vitest.config.ts`; `client/src/test/setup.ts` registers jest-dom matchers and runs `cleanup()` after each test.

**Executing** (from `client/`):

- `bun run test` — run the whole suite once (use this for CI / verifying a change).
- `bun run test:watch` — terminal watch mode; re-runs affected tests on save.
- `bun run test:ui` — Vitest browser UI (live dashboard, rendered DOM, module graph); use this while authoring tests.
- Target a single file: `bun run test -- src/pages/Users.test.tsx`.

**Writing**:

- Place the test next to the component: `ComponentName.test.tsx`.
- Wrap components that use TanStack React Query with `renderWithQuery` from `@/test/render` (it provides a fresh, retry-disabled `QueryClient` per render; the client factory itself is `createTestQueryClient` in `@/test/query-client`).
- **Mocking the API**: the app calls a shared `api = axios.create(...)` instance (`@/lib/api`), so a bare `vi.mock("axios")` auto-mock won't work — `axios.create()` must return a controllable instance. Use a factory whose `create()` returns a single shared mock, then drive it via `vi.mocked(axios, { deep: true })`:
  ```ts
  vi.mock("axios", () => {
    const instance = { get: vi.fn(), post: vi.fn(), /* ... */ };
    return { default: Object.assign(instance, { create: vi.fn(() => instance), isAxiosError: vi.fn(() => false) }) };
  });
  const mockedAxios = vi.mocked(axios, { deep: true }); // mockedAxios.get.mockResolvedValue(...)
  ```
- **Stub child components that aren't under test** when they pull in the router or auth session (e.g. `vi.mock("@/components/Navbar", () => ({ default: () => null }))`) so the test stays focused and doesn't need a `<Router>`/session.
- Use `findBy*` / `await` for async query states. When a loading skeleton mirrors the loaded layout (e.g. a skeleton table with the **same** column headers), wait on success-only content (a data value), not on shared structure — otherwise the assertion resolves against the still-loading skeleton.
- **Scope**: rendering, component states (loading/empty/error), data display, error handling, and form-validation messages belong here — not full-stack flows (those are E2E).

### E2E Tests

- **Framework**: Playwright, in the `/e2e` workspace (dedicated `helpdesk_test` database). Run with `npm run test:e2e` from the repo root.
- **Always write E2E tests via the `e2e-test-writer` agent** — do not hand-write Playwright specs directly. Whenever a task calls for a new or updated E2E/Playwright test, delegate it to the `e2e-test-writer` agent (invoke it through the Agent tool).
- The agent owns the full E2E guidance: test-database setup, run/debug commands, Playwright conventions, and which scenarios warrant an E2E test vs. a component test. Keep that detail in the agent, not here.
