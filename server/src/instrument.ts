// Sentry error monitoring — initialized before any other module so its
// instrumentation can hook Node internals (see the top-of-file import in index.ts).
//
// Optional, like AI and email: with SENTRY_DSN unset the SDK stays disabled and the
// app runs normally (errors are just not reported). Bun auto-loads server/.env, so
// process.env.SENTRY_DSN is available here without an explicit dotenv import.
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    // Trace a small sample of requests for performance monitoring. Tune per env.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}
