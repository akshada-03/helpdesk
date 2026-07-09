import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "../db";

// baseURL and secret are read from BETTER_AUTH_URL / BETTER_AUTH_SECRET env vars.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // The client runs on a different origin than this API, so it must be trusted
  // for cross-origin sign-in. Set via CLIENT_URL (see .env.example); mirrors the
  // CORS origin in index.ts.
  trustedOrigins: [process.env.CLIENT_URL!],
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
