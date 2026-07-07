# Helpdesk

AI-powered ticket management system. Full-stack monorepo:

- **`client/`** — React + TypeScript, bundled and served by Bun's native
  dev server (HTML imports + HMR, no Vite).
- **`server/`** — Express + TypeScript, run directly by Bun.

## Prerequisites

- [Bun](https://bun.sh) 1.3+ (runtime, bundler, dev server)
- [Node.js](https://nodejs.org) with npm (used **only** to install
  dependencies — see note below)

> **Install with npm, not `bun install`, on this machine.**
> `bun install` currently creates empty package directories here (it
> builds the folder tree but writes no files, so nothing resolves at
> runtime — likely security-software interference with Bun's file
> linking). `npm install` writes real files, and Bun runs them fine.
> If a future Bun/OS update fixes this, `bun install` can replace `npm
> install` with no other changes.

## Setup

```bash
npm install        # installs both workspaces (client + server)
```

## Development

```bash
bun run dev         # runs client + server together
# or individually:
bun run dev:server  # Express API  → http://localhost:3001
bun run dev:client  # React app    → http://localhost:3000
```

The React app calls the API at `http://localhost:3001` (override with
the `API_URL` env var). CORS on the server allows the client origin
(`CLIENT_URL`, default `http://localhost:3000`).

## Other scripts

```bash
bun run build       # production build of the client → client/dist
bun run start       # run the server in production mode
bun run typecheck   # type-check both workspaces
```

## Layout

```
helpdesk/
├── package.json          # workspace root + top-level scripts
├── tsconfig.base.json    # shared TS config
├── client/
│   ├── index.html        # entry; imports src/frontend.tsx + CSS
│   ├── serve.ts          # Bun.serve dev server (HMR, SPA fallback)
│   └── src/
│       ├── frontend.tsx  # React mount point
│       ├── App.tsx
│       └── index.css
└── server/
    └── src/
        ├── index.ts      # Express app + middleware
        └── routes.ts     # /api router (health check for now)
```
