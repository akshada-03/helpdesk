import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "../db";
import { CLIENT_URL, isProduction } from "./env";

// baseURL and secret are read from BETTER_AUTH_URL / BETTER_AUTH_SECRET env vars.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // The client runs on a different origin than this API, so it must be trusted
  // for cross-origin sign-in. Uses the same validated CLIENT_URL as the CORS
  // origin in index.ts (see lib/env.ts).
  trustedOrigins: [CLIENT_URL],
  // Throttle auth endpoints in production only, so local dev and E2E test runs
  // aren't blocked by the sign-in limit. Sign-in is locked down harder to blunt
  // password brute-forcing against the seeded account(s).
  rateLimit: {
    enabled: isProduction,
    window: 60, // seconds
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
    },
  },
  // Force the Secure cookie attribute in production (served over HTTPS).
  advanced: {
    useSecureCookies: isProduction,
  },
  emailAndPassword: {
    enabled: true, // email/password sign-in
    disableSignUp: true, // public sign-up disabled — users seeded/created elsewhere
  },
  user: {
    additionalFields: {
      // "admin" | "agent" — included in session; not settable via the API.
      role: {
        type: "string",
        required: false,
        defaultValue: "agent",
        input: false,
      },
    },
  },
});
