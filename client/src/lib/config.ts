// The Express/Better Auth API base URL, resolved in three steps:
//
//  1. An explicit API_URL, for a split deploy where the client is hosted apart
//     from the API. `typeof` guard so this never throws in the browser, where
//     `process` may be undefined (Bun's dev server does not shim it); a
//     `bun build --define process.env.API_URL=...` still works.
//  2. In production the API serves this bundle, so the API *is* this origin.
//     Deriving it at runtime means the build needs no baked-in URL — the same
//     artifact works on any host (Render, a preview URL, a custom domain).
//  3. Dev fallback: client (:3000) and server (:3001) are separate processes.
const explicitApiUrl =
  typeof process !== "undefined" ? process.env?.API_URL : undefined;

const isBrowser = typeof window !== "undefined";
const isLocalhost =
  isBrowser && ["localhost", "127.0.0.1"].includes(window.location.hostname);

export const API_URL =
  explicitApiUrl ||
  (isBrowser && !isLocalhost ? window.location.origin : "http://localhost:3001");
