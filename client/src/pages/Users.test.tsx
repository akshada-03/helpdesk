import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios, { type AxiosResponse } from "axios";

import { Role } from "core/constants/role.ts";
import type { UserListItem, UserListResponse } from "core/schemas/users.ts";
import { renderWithQuery } from "@/test/render";
import Users from "./Users";

// The Users page renders <Navbar />, which depends on the router and the auth
// session. Those aren't under test here, so stub the Navbar out.
vi.mock("@/components/Navbar", () => ({ default: () => null }));

// Mock Axios and drive the shared `api` instance (created via `axios.create`).
vi.mock("axios", () => {
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  return {
    default: Object.assign(instance, {
      create: vi.fn(() => instance),
      isAxiosError: vi.fn(() => false),
    }),
  };
});

const mockedAxios = vi.mocked(axios, { deep: true });

// Helpers to script the GET /api/users response.
function respondWith(users: UserListItem[]) {
  mockedAxios.get.mockResolvedValue({
    data: { users } satisfies UserListResponse,
  } as AxiosResponse<UserListResponse>);
}

function respondPending() {
  // A promise that never settles keeps the query in its loading state.
  mockedAxios.get.mockReturnValue(new Promise(() => {}));
}

function respondError() {
  mockedAxios.get.mockRejectedValue({});
}

const admin: UserListItem = {
  id: "u-admin",
  name: "Alice Admin",
  email: "alice@example.com",
  role: Role.admin,
  emailVerified: true,
  createdAt: "2026-01-15T10:00:00.000Z",
};

const agent: UserListItem = {
  id: "u-agent",
  name: "Bob Agent",
  email: "bob@example.com",
  role: Role.agent,
  emailVerified: true,
  createdAt: "2026-02-20T10:00:00.000Z",
};

describe("Users page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("always renders the page heading and description", () => {
    respondPending();
    renderWithQuery(<Users />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Users" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Everyone with access to the helpdesk."),
    ).toBeInTheDocument();
  });

  it("shows skeleton placeholders while loading", () => {
    respondPending();
    const { container } = renderWithQuery(<Users />);

    // Loading state is a skeleton table, not a "Loading…" message.
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("table")).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("renders a row per user with name, email, role, and joined date", async () => {
    respondWith([admin, agent]);
    renderWithQuery(<Users />);

    // The loading skeleton shares the same column headers, so wait on a value
    // that only appears once real data has loaded.
    expect(await screen.findByText("Alice Admin")).toBeInTheDocument();

    // Column headers.
    for (const header of ["Name", "Email", "Role", "Joined"]) {
      expect(
        screen.getByRole("columnheader", { name: header }),
      ).toBeInTheDocument();
    }

    // Admin row.
    const adminRow = screen.getByText("Alice Admin").closest("tr")!;
    expect(within(adminRow).getByText("alice@example.com")).toBeInTheDocument();
    expect(within(adminRow).getByText(Role.admin)).toBeInTheDocument();
    expect(
      within(adminRow).getByText(new Date(admin.createdAt).toLocaleDateString()),
    ).toBeInTheDocument();

    // Agent row.
    const agentRow = screen.getByText("Bob Agent").closest("tr")!;
    expect(within(agentRow).getByText("bob@example.com")).toBeInTheDocument();
    expect(within(agentRow).getByText(Role.agent)).toBeInTheDocument();

    // Two data rows (plus the header row) => 3 total.
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("hits the admin user list endpoint", async () => {
    respondWith([admin]);
    renderWithQuery(<Users />);

    await screen.findByText("Alice Admin");
    expect(mockedAxios.get).toHaveBeenCalledWith("/api/users");
  });

  it("shows an empty state when there are no users", async () => {
    respondWith([]);
    renderWithQuery(<Users />);

    expect(await screen.findByText("No users found.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an error alert when the request fails", async () => {
    respondError();
    renderWithQuery(<Users />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Failed to load users.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("Users page — create-user dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The table isn't what we're testing here; settle it to the empty state so
    // its query doesn't error out underneath the dialog assertions.
    respondWith([]);
  });

  it("shows the dialog when the New user button is clicked", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Users />);

    // Closed on first render.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /new user/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("hides the dialog when Escape is pressed", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Users />);

    await user.click(screen.getByRole("button", { name: /new user/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("hides the dialog when clicking outside it (the overlay)", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Users />);

    await user.click(screen.getByRole("button", { name: /new user/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    // The overlay is the full-screen backdrop behind the dialog content;
    // pressing down on it is "clicking outside" as far as Radix is concerned.
    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    expect(overlay).not.toBeNull();
    await user.click(overlay as HTMLElement);

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
