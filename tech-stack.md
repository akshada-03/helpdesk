# Tech Stack

A cohesive, TypeScript-end-to-end stack for the AI-powered ticket
management system.

## Overview

| Layer | Choice | Why |
|---|---|---|
| **Language** | TypeScript (end-to-end) | One language across front/back; strong typing for ticket/user models |
| **Framework** | Next.js (App Router) | Single app for the dashboard UI + API routes; SSR for fast ticket lists |
| **UI** | React + Tailwind CSS + shadcn/ui | Fast, accessible components for tables, filters, detail views |
| **Database** | PostgreSQL | Relational fit: tickets, statuses, categories, users, replies |
| **ORM** | Prisma | Type-safe schema + migrations; models map cleanly to the enums |
| **Auth** | Auth.js (NextAuth) with **database sessions** | Email/password + role field (admin/agent); admin-only user management |
| **AI** | Claude API (`claude-opus-4-8` for quality, `claude-haiku-4-5` for cheap classification) | Classification, summaries, suggested replies |
| **Knowledge base / RAG** | pgvector (Postgres extension) | Keep embeddings in the same DB — no extra infra |
| **Inbound email** | Postmark or SendGrid Inbound Parse (webhook → API route) | Converts incoming emails into tickets |
| **Background jobs** | Inngest or a simple queue | Run AI classification/summarization async so email intake stays fast |
| **Hosting** | Vercel (app) + Neon/Supabase (Postgres) | Low-ops, scales with load |

## Authentication

Authentication uses **database sessions** (not JWTs). Auth.js persists
sessions in PostgreSQL via the Prisma adapter:

- On login, a session row is created and the client holds only an opaque
  session token (HTTP-only cookie).
- Each request looks up the session in Postgres, so sessions can be
  revoked instantly (e.g. when an admin disables an agent).
- The `User` model carries a `role` field (`admin` | `agent`) used for
  authorization, including admin-only user management.

This keeps session state server-side and centralized in the same
database as the rest of the app data.

## Why this shape

- **One repo, one language.** Next.js gives you the dashboard and the API
  (email webhook, ticket CRUD, AI endpoints) in a single deployable app —
  less glue for a small team.
- **Postgres does triple duty.** Relational data, `pgvector` for the
  knowledge base, sessions for auth, and enums for `status`
  (open/resolved/closed) and `category` (general/technical/refund). No
  separate vector DB or session store needed at this scale.
- **Two-tier AI model use.** Classification runs on every inbound email —
  use the cheaper, fast **Haiku 4.5** there. Reserve **Opus 4.8** for
  summaries and suggested replies where quality matters.
- **Async AI.** Email intake creates the ticket immediately and enqueues
  the AI work, so a slow model call never blocks or drops an incoming
  email.
