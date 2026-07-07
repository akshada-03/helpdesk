import { useEffect, useState } from "react";

// The Express API base URL. In dev, client (:3000) and server (:3001) run
// locally. `typeof` guard so this never throws in the browser, where
// `process` may be undefined (Bun's dev server does not shim it); a
// production `bun build --define process.env.API_URL=...` still works.
const API_URL =
  (typeof process !== "undefined" && process.env?.API_URL) ||
  "http://localhost:3001";

type Health = { status: string; timestamp: string };

type HealthState =
  | { kind: "loading" }
  | { kind: "ok"; data: Health }
  | { kind: "error"; message: string };

export function App() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      try {
        const res = await fetch(`${API_URL}/api/health`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Health;
        if (!cancelled) setHealth({ kind: "ok", data });
      } catch {
        if (!cancelled) {
          setHealth({ kind: "error", message: "Could not reach the API." });
        }
      }
    }

    checkHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="container">
      <h1>Helpdesk</h1>
      <p>AI-powered ticket management system.</p>
      <div className="card">
        {health.kind === "loading" && <span>Checking API health…</span>}
        {health.kind === "ok" && (
          <span className="status-ok">
            ✓ API is healthy (status: {health.data.status}, checked{" "}
            {new Date(health.data.timestamp).toLocaleTimeString()})
          </span>
        )}
        {health.kind === "error" && (
          <span className="status-bad">✗ {health.message}</span>
        )}
      </div>
    </main>
  );
}
