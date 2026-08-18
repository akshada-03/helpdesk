import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
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
    ipAddress: {
      ipAddressHeaders: [
        "x-forwarded-for",
        "x-real-ip",
        "cf-connecting-ip",
        "render-proxy-ip",
      ],
      trustedProxies: ["127.0.0.1", "::1", "0.0.0.0/0", "*"],
    },
  },
  emailAndPassword: {
    enabled: true, // email/password sign-in
    disableSignUp: true, // public sign-up disabled — users seeded/created elsewhere
  },
  databaseHooks: {
    session: {
      create: {
        // Block soft-deleted (deactivated) users from establishing a session.
        // This runs on sign-in and on any session (re)creation, so a deleted
        // user can neither log in nor refresh an old session into a new one.
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { deletedAt: true },
          });
          if (user?.deletedAt) {
            throw new APIError("FORBIDDEN", {
              message: "This account has been deactivated.",
            });
          }
          return { data: session };
        },
      },
    },
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
