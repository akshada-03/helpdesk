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
