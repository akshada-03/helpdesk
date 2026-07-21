# Deploying Helpdesk for free

## The shape of the problem

This app is **not** serverless-friendly, and that drives every choice below:

- `pg-boss` workers (`classify-ticket`, `auto-resolve-ticket`) need a **long-running process**.
- The IMAP poller (`startInboundEmailPolling`) is an interval loop — same requirement.
- Prisma + Postgres need a real connection, not an edge runtime.

So Vercel/Netlify *functions* are out for the API. We need one always-on container plus a Postgres.

## Recommended stack (all free, no credit card)

| Piece | Service | Free tier |
|---|---|---|
| Postgres | **Neon** | 0.5 GB, permanently free |
| API + client | **Render** web service (Docker) | 512 MB, 750 instance-hours/month |
| AI | Google AI Studio (already configured) | free Gemini key |
| Email | Gmail + App Password | free |
| Errors | Sentry | 5k events/month |

**One service, not two.** The API also serves the built client. This is deliberate: it puts the
client and the API on the **same origin**, which sidesteps the cross-site cookie problem entirely
(see "Why same-origin" below). Render's free Postgres expires after 30 days, which is why the
database lives on Neon instead.

### The one real tradeoff

Render's free tier **spins down after 15 minutes of inactivity**. While asleep:

- the first request afterwards takes ~50 s (cold start),
- **background jobs don't run** — inbound email isn't polled, tickets aren't classified.

Tickets already in the queue are picked up when it wakes; nothing is lost, just delayed. If that
matters, ping the service every 10 min with a free UptimeRobot monitor — 720 h/month of uptime fits
inside the 750-hour allowance, but only for a *single* free service.

---

## Step 1 — Database on Neon

1. Sign up at <https://neon.tech> → create project `helpdesk` (pick the region nearest your Render region).
2. Copy the **pooled** connection string and append `connect_timeout=15`:
   ```
   postgresql://user:pass@ep-xxx-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require&connect_timeout=15
   ```

   All three parts matter, and getting any of them wrong produces the *same* unhelpful
   `P1001: Can't reach database server` — which reads like a network outage when it isn't:

   - **`-pooler` in the hostname.** The direct endpoint is a different host.
   - **`sslmode=require`.** Neon refuses plaintext connections, and Prisma reports that refusal
     as P1001 rather than a TLS error.
   - **`connect_timeout=15`.** Neon's free compute suspends after ~5 min idle; the first
     connection must wake it, and Prisma's 5-second default can expire mid-wake. Without this
     you get *intermittent* P1001s, which are far worse to debug.

   Before putting the string in Render, prove it works from your machine:
   ```powershell
   $env:DATABASE_URL="postgresql://...-pooler...?sslmode=require&connect_timeout=15"
   bunx prisma migrate deploy
   ```
3. From your machine, point the server at it and push the schema + seed the admin:

   ```bash
   cd server
   # temporarily, in server/.env
   # DATABASE_URL="postgresql://...-pooler...?sslmode=require"
   npx prisma migrate deploy
   npm run db:seed
   ```

   Seeding locally is the workaround for the free tier having no shell access. `SEED_ADMIN_EMAIL` /
   `SEED_ADMIN_PASSWORD` from your `.env` become your login — set them to something real first.

`pg-boss` creates its own `pgboss` schema on boot; no migration needed.

---

## Step 2 — Code changes (already applied)

These are committed to the repo — this section documents what changed and why.

### 2a. Serve the built client from Express

`server/src/index.ts` had a catch-all 404 that swallowed every non-API route. It's now scoped to
`/api`, with static serving and an SPA fallback behind an `isProduction` guard (in dev the client
runs its own server with HMR, so this must not intercept):

```ts
if (isProduction) {
  const clientDist = path.resolve(import.meta.dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("/{*any}", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}
```

Note the **named** wildcard `/{*any}` — Express 5's matcher throws at boot on a bare `*`.

### 2b. API URL resolved at runtime, not baked at build time

`client/src/lib/config.ts` fell back to `http://localhost:3001`, which would have shipped to
production. Rather than substituting a URL at build time, it now derives the origin at runtime:

```ts
export const API_URL =
  explicitApiUrl ||
  (isBrowser && !isLocalhost ? window.location.origin : "http://localhost:3001");
```

This is a deliberate change from the build-time `--define` approach originally sketched here.
`--define` would have meant a Docker build arg, shell-quoting that behaves differently on Windows
than in the Linux image, and a substitution that may not even match through `config.ts`'s
`process.env?.` optional chaining. Deriving the origin at runtime removes all of that, and makes the
image **portable** — the same build works on a Render URL, a preview URL, or a custom domain with no
rebuild. An explicit `API_URL` still takes precedence, so a split deploy remains possible.

### 2c. Dockerfile

Render has no native Bun runtime, so the repo now has a root `Dockerfile` and `.dockerignore`.
Four details worth knowing:

- **`oven/bun` ships no Node.js — `npm` and `npx` do not exist in the image.** Every step must use
  `bun` / `bunx`, or the build dies with `npm: not found` (exit 127).
- Install is plain `bun install`, not `--frozen-lockfile`: the committed lockfile is
  `package-lock.json` and there's no `bun.lock`, so there's nothing to freeze against. Bun reads and
  migrates `package-lock.json`, so resolutions still come from the committed lockfile.
- `prisma generate` runs at **build** time — its output (`server/src/generated/prisma`) is imported
  by `src/db.ts` at runtime, so generating on boot would be too late. It gets a placeholder
  `DATABASE_URL` because `.dockerignore` excludes `.env` and `prisma.config.ts` requires the var;
  generate only reads the schema, so the value is never used.
- The start command runs `prisma migrate deploy` before the server. It's idempotent and safe to
  repeat, but note it **blocks boot**: if the database is unreachable the server never starts, and
  Render reports the confusing "No open ports detected" rather than a database error. Look above
  that message for the real cause.

### 2d. Client builds through `build.ts`, not the `bun build` CLI

`client/bunfig.toml` registers `bun-plugin-tailwind` under `[serve.static]`, which applies **only to
the dev server** in `serve.ts`. The `bun build` CLI never reads it, so the production bundle shipped
with `@tailwind` / `@theme` directives untouched and zero utility classes — localhost looked perfect
while the deployed site rendered completely unstyled.

The build now goes through `client/build.ts`, which passes the plugin explicitly via `Bun.build()`.
If you ever change the build command, keep the plugin — and verify with:

```bash
cd client && bun run build
grep -c '\.flex{' dist/*.css   # must be ≥ 1; zero means Tailwind didn't run
```

The telltale sign at build time is `warn: invalid @ rule encountered: '@tailwind'`. It's a warning,
not an error, so the build "succeeds" and the breakage only shows up in the browser.

---

## Step 3 — Deploy on Render

1. Push to GitHub (Render deploys from a repo).
2. <https://render.com> → **New → Web Service** → connect the repo.
3. Runtime **Docker**, instance type **Free**.
4. Render assigns the URL (`https://helpdesk-b8hm.onrender.com`) when you create the service — you
   can see it before the first build finishes. You need it for the env vars below.
5. Under **Environment**, add:

   ```
   NODE_ENV=production
   DATABASE_URL=<Neon pooled connection string>
   BETTER_AUTH_SECRET=<openssl rand -base64 32>
   BETTER_AUTH_URL=https://helpdesk-b8hm.onrender.com
   CLIENT_URL=https://helpdesk-b8hm.onrender.com
   API_BASE_URL=https://helpdesk-b8hm.onrender.com
   ```

   `CLIENT_URL` and `API_BASE_URL` are **required in production** — `server/src/lib/env.ts` throws at
   boot if either is missing. Same origin for all three, since one service serves both.

   No `API_URL` and no Docker build arguments are needed — see 2b.

6. Render sets `PORT` itself; `index.ts` reads it (`process.env.PORT ?? 3001`), so it just works.

Optional, all safe to omit — the app boots and runs without them:

```
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
AI_MODEL=gemini-flash-lite-latest
AI_API_KEY=<free key from https://aistudio.google.com/apikey>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@gmail.com
SMTP_PASS=<16-char Gmail App Password>
IMAP_HOST=imap.gmail.com
WEBHOOK_SECRET=<long random string>
SENTRY_DSN=<from sentry.io>
```

Without `AI_*`, ticket classification and reply polishing return 502 but nothing else breaks.
Without SMTP/IMAP, replies are saved and shown in the UI but never emailed.

---

## Why same-origin (the trap this avoids)

If you split the client onto Cloudflare Pages and the API onto Render, they're different registrable
domains, so the session cookie becomes **cross-site**. Better Auth defaults to `SameSite=Lax`, and
browsers refuse to send a Lax cookie cross-site — you'd sign in successfully and then be treated as
logged out on every subsequent request. Fixing it means adding to `server/src/lib/auth.ts`:

```ts
advanced: {
  useSecureCookies: isProduction,
  defaultCookieAttributes: isProduction
    ? { sameSite: "none", secure: true, partitioned: true }
    : undefined,
},
```

That works, but `SameSite=None` is strictly worse for CSRF and browsers keep tightening third-party
cookie rules. Serving both from one origin avoids the whole category. Only split them if you
specifically want the client on a CDN that never sleeps.

---

## Verifying the deploy

```bash
# Public health endpoint (routes.ts mounts it before the requireAuth guard).
curl https://helpdesk-b8hm.onrender.com/api/health   # {"status":"ok","timestamp":"..."}

# Auth guard is active.
curl -i https://helpdesk-b8hm.onrender.com/api/tickets   # expect 401

# SPA fallback: a deep client route returns index.html, not a 404.
curl -i https://helpdesk-b8hm.onrender.com/tickets/1   # expect 200 text/html
```

Then open the URL, sign in with your seeded admin credentials, and check Render's **Logs** tab for
`API server listening on…`. If boot fails, the usual causes are a missing `CLIENT_URL`/`API_BASE_URL`
(fatal by design) or a `DATABASE_URL` without `?sslmode=require`.

## Other free options, briefly

- **Fly.io** — better than Render technically (no spin-down on the hobby allowance), but now requires
  a card on file.
- **Railway** — $5 one-time trial credit, then paid. Fine for a demo, not ongoing.
- **Koyeb** — one free instance, no card, no sleep. Good Render alternative if the cold starts annoy you.
- **Supabase** instead of Neon — also free Postgres; Neon is suggested only because its pooled
  connection string works with Prisma out of the box.
