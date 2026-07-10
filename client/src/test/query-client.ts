import { QueryClient } from "@tanstack/react-query";

// A fresh QueryClient per render keeps cache/state from leaking between tests.
// Retries are disabled so error states surface immediately instead of after
// several timed attempts.
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}
