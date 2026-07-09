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
