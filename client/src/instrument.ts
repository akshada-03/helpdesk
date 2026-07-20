import * as Sentry from "@sentry/react";

// Sentry browser error monitoring. Optional: with no DSN configured the SDK stays
// disabled and the app runs normally. The DSN is public (safe to ship in the bundle).
//
// `typeof` guard so this never throws in the browser, where `process` may be
// undefined (Bun's dev server does not shim it); a production build injects the
// value via `bun build --define process.env.SENTRY_DSN=...` (see client/package.json).
const dsn =
  (typeof process !== "undefined" && process.env?.SENTRY_DSN) || undefined;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      (typeof process !== "undefined" && process.env?.NODE_ENV) ||
      "development",
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  });
}
