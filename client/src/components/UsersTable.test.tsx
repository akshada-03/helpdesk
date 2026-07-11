import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios, { type AxiosResponse } from "axios";

import { Role } from "core/constants/role.ts";
import type { UserListItem, UserListResponse } from "core/schemas/users.ts";
import { renderWithQuery } from "@/test/render";
import UsersTable from "./UsersTable";

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

function respondWith(users: UserListItem[]) {
  mockedAxios.get.mockResolvedValue({
    data: { users } satisfies UserListResponse,
  } as AxiosResponse<UserListResponse>);
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

describe("UsersTable — edit action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders an edit button for each user row", async () => {
    respondWith([admin, agent]);
    renderWithQuery(<UsersTable />);

    // Wait for real data (skeleton shares the header/columns).
    await screen.findByText("Alice Admin");

    expect(
      screen.getByRole("button", { name: "Edit Alice Admin" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit Bob Agent" }),
    ).toBeInTheDocument();
  });

  it("opens the edit dialog populated with that row's data", async () => {
    respondWith([admin, agent]);
    const user = userEvent.setup();
    renderWithQuery(<UsersTable />);

    await screen.findByText("Bob Agent");

    // No dialog until the edit button is clicked.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit Bob Agent" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Edit user" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Bob Agent");
    expect(within(dialog).getByLabelText("Email")).toHaveValue("bob@example.com");
  });
});

describe("UsersTable — delete action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a delete button for non-admins but not for admins", async () => {
    respondWith([admin, agent]);
    renderWithQuery(<UsersTable />);

    await screen.findByText("Bob Agent");

    // Agents can be deleted; admins cannot, so they get no delete button.
    expect(
      screen.getByRole("button", { name: "Delete Bob Agent" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete Alice Admin" }),
    ).not.toBeInTheDocument();
  });

  it("opens the delete confirmation when the delete button is clicked", async () => {
    respondWith([admin, agent]);
    const user = userEvent.setup();
    renderWithQuery(<UsersTable />);

    await screen.findByText("Bob Agent");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete Bob Agent" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Delete user" }),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Bob Agent");
  });
});
