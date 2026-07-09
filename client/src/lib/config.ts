// The Express/Better Auth API base URL. In dev, client (:3000) and server
// (:3001) run locally. `typeof` guard so this never throws in the browser,
// where `process` may be undefined (Bun's dev server does not shim it); a
// production `bun build --define process.env.API_URL=...` still works.
export const API_URL =
  (typeof process !== "undefined" && process.env?.API_URL) ||
  "http://localhost:3001";
