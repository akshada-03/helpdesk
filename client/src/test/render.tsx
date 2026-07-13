import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

import { createTestQueryClient } from "@/test/query-client";

type RenderWithQueryOptions = Omit<RenderOptions, "wrapper"> & {
  // Initial history entries for the wrapping router (e.g. ["/tickets/t-1"] so a
  // component reading `useParams` sees the id). Defaults to ["/"].
  initialEntries?: string[];
};

// Renders `ui` wrapped in a TanStack Query provider and a MemoryRouter (so
// components using `Link` / `useParams` work without a full app router). Use for
// any component that calls `useQuery` / `useMutation`. Returns the RTL result
// plus the queryClient.
export function renderWithQuery(
  ui: ReactElement,
  { initialEntries = ["/"], ...options }: RenderWithQueryOptions = {},
) {
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) };
}
