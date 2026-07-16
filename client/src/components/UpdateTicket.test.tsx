import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import axios, { type AxiosResponse } from "axios";

import { Role } from "core/constants/role.ts";
import type { TicketDetail as TicketDetailData } from "core/schemas/tickets.ts";
import { renderWithQuery } from "@/test/render";
import { useSession } from "@/lib/auth-client";
import UpdateTicket from "./UpdateTicket";

// The assignee control is gated on the current user's role. Default to admin;
// individual tests override via `mockRole`.
vi.mock("@/lib/auth-client", () => ({ useSession: vi.fn() }));
const mockedUseSession = vi.mocked(useSession);
function mockRole(role: Role) {
  mockedUseSession.mockReturnValue({
    data: { user: { role } },
    isPending: false,
  } as ReturnType<typeof useSession>);
}

// Mock Axios and drive the shared `api` instance (created via `axios.create`).
// AssigneeSelect fetches the agents list on render.
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

const ticket: TicketDetailData = {
  id: 103,
  subject: "Cannot log in",
  body: "I keep getting an error when I try to sign in.",
  bodyHtml: null,
  requesterEmail: "jane@example.com",
  requesterName: "Jane Doe",
  status: "open",
  category: "technical_question",
  createdAt: "2026-03-02T10:00:00.000Z",
  updatedAt: "2026-03-03T12:00:00.000Z",
  assignee: null,
};

describe("UpdateTicket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRole(Role.admin);
    mockedAxios.get.mockResolvedValue({ data: { agents: [] } } as AxiosResponse);
  });

  it("renders the status, category, and (admin) assignee controls", () => {
    renderWithQuery(<UpdateTicket ticket={ticket} />);

    expect(
      screen.getByRole("combobox", { name: "Update status" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Update category" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Assign to agent" }),
    ).toBeInTheDocument();
  });

  it("shows the assignee read-only (no picker) for agents", () => {
    mockRole(Role.agent);
    renderWithQuery(<UpdateTicket ticket={ticket} />);

    expect(
      screen.queryByRole("combobox", { name: "Assign to agent" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });
});
