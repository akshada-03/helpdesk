// Centralized, validated environment access. Read each value once here so that
// CORS (index.ts) and Better Auth trustedOrigins (auth.ts) never diverge.

export const isProduction = process.env.NODE_ENV === "production";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// The client runs on a different origin than the API, so its URL drives both the
// CORS origin and Better Auth's trustedOrigins. In production it must be set
// explicitly (fail fast on misconfiguration); in dev fall back to the Vite origin.
export const CLIENT_URL = isProduction
  ? requireEnv("CLIENT_URL")
  : process.env.CLIENT_URL ?? "http://localhost:3000";

// Public base URL where this API is reachable (e.g. for building webhook/callback
// URLs). Required in production; falls back to the local server port in dev.
export const API_BASE_URL = isProduction
  ? requireEnv("API_BASE_URL")
  : process.env.API_BASE_URL ?? "http://localhost:3001";

// Optional shared secret for the inbound-email webhook. When set, the webhook
// requires a matching `?token=`; leaving it unset (local dev / E2E) disables the
// check so posts and tests work without a token.
export const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// AI provider config (see lib/ai.ts). Any OpenAI-compatible /chat/completions
// endpoint works, so the vendor is a matter of configuration, not code:
//   AI_BASE_URL — endpoint root, e.g. Gemini's OpenAI-compat URL
//   AI_API_KEY  — that provider's key
//   AI_MODEL    — model id to send, e.g. gemini-2.5-flash
// Deliberately NOT required at boot: the app is fully usable without AI (only the
// reply polisher needs it), and E2E/dev runs shouldn't need a key. lib/ai.ts throws
// a clear error if a feature is invoked while these are unset, which the route
// turns into a 502.
export const AI_BASE_URL = process.env.AI_BASE_URL;
export const AI_API_KEY = process.env.AI_API_KEY;
export const AI_MODEL = process.env.AI_MODEL;

// --- Outbound email (SMTP, via nodemailer) ---
// Sends agent + AI replies back to the requester. Entirely optional, like AI: with
// these unset the app runs normally and simply doesn't email anyone (replies are
// still saved and shown in the UI). Any SMTP server works — a free Gmail account
// with an App Password is the zero-cost default (see server/.env.example).
//   SMTP_HOST/PORT — the server, e.g. smtp.gmail.com:465
//   SMTP_SECURE    — "true" for implicit TLS (port 465); "false" for STARTTLS (587)
//   SMTP_USER/PASS — the mailbox login (for Gmail, an App Password, not the account one)
//   SMTP_FROM      — the From address on outgoing mail (defaults to SMTP_USER)
export const SMTP_HOST = process.env.SMTP_HOST;
export const SMTP_PORT = process.env.SMTP_PORT;
export const SMTP_SECURE = process.env.SMTP_SECURE;
export const SMTP_USER = process.env.SMTP_USER;
export const SMTP_PASS = process.env.SMTP_PASS;
export const SMTP_FROM = process.env.SMTP_FROM;

// --- Inbound email (IMAP polling, via imapflow) ---
// Polls a mailbox and turns each new message into a ticket — the same intake as the
// SendGrid webhook, for setups without a provider that can POST webhooks. Optional:
// unset means no polling (the webhook still works). Reuses the SMTP mailbox by
// default when only the host differs.
//   IMAP_HOST/PORT — the server, e.g. imap.gmail.com:993
//   IMAP_SECURE    — "false" to disable implicit TLS (defaults to true; 993 is TLS)
//   IMAP_USER/PASS — mailbox login (defaults to SMTP_USER/SMTP_PASS — same account)
//   IMAP_POLL_SECONDS — how often to check for new mail (defaults to 60)
export const IMAP_HOST = process.env.IMAP_HOST;
export const IMAP_PORT = process.env.IMAP_PORT;
export const IMAP_SECURE = process.env.IMAP_SECURE;
export const IMAP_USER = process.env.IMAP_USER ?? SMTP_USER;
export const IMAP_PASS = process.env.IMAP_PASS ?? SMTP_PASS;
export const IMAP_POLL_SECONDS = process.env.IMAP_POLL_SECONDS;
