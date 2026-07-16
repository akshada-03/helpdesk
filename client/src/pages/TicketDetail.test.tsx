import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import axios, { type AxiosResponse } from "axios";

import { Role } from "core/constants/role.ts";
import type { TicketDetail as TicketDetailData } from "core/schemas/tickets.ts";
import { renderWithQuery } from "@/test/render";
import { useSession } from "@/lib/auth-client";
import TicketDetail from "./TicketDetail";

// Stub the Navbar — it pulls in the auth session and router links that aren't
// under test here.
vi.mock("@/components/Navbar", () => ({ default: () => null }));

// The page gates the editable assignee control on the current user's role.
// Default to an admin session; individual tests override via `mockRole`.
vi.mock("@/lib/auth-client", () => ({ useSession: vi.fn() }));
const mockedUseSession = vi.mocked(useSession);
function mockRole(role: Role) {
  mockedUseSession.mockReturnValue({
    data: { user: { role } },
    isPending: false,
  } as ReturnType<typeof useSession>);
}

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

// The detail page loads the ticket, its reply thread (via TicketReplies), and
// (via AssigneeSelect) the agents list. Route GET by URL so each call gets an
// appropriately shaped response. Pass `{ fail: true }` to make the ticket request
// reject (agents and replies still resolve).
function mockGets({ fail = false }: { fail?: boolean } = {}) {
  mockedAxios.get.mockImplementation((url: string) => {
    if (url === "/api/agents") {
      return Promise.resolve({ data: { agents: [] } } as AxiosResponse);
    }
    if (url.endsWith("/replies")) {
      return Promise.resolve({ data: [] } as AxiosResponse);
    }
    return fail
      ? Promise.reject({})
      : Promise.resolve({ data: ticket } as AxiosResponse<TicketDetailData>);
  });
}

function renderDetail(id: number | string = 103) {
  return renderWithQuery(
    <Routes>
      <Route path="/tickets/:id" element={<TicketDetail />} />
    </Routes>,
    { initialEntries: [`/tickets/${id}`] },
  );
}

describe("TicketDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRole(Role.admin);
  });

  it("requests the ticket by the id from the route", async () => {
    mockGets();
    renderDetail(103);

    await screen.findByText("Cannot log in");
    expect(mockedAxios.get).toHaveBeenCalledWith("/api/tickets/103");
  });

  it("shows a skeleton while loading", () => {
    mockedAxios.get.mockReturnValue(new Promise(() => {}));
    const { container } = renderDetail();

    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(0);
  });

  it("renders the subject, body, and sender", async () => {
    mockGets();
    renderDetail();

    expect(await screen.findByText("Cannot log in")).toBeInTheDocument();
    expect(
      screen.getByText("I keep getting an error when I try to sign in."),
    ).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
  });

  it("renders editable status, category, and (admin) assignee controls", async () => {
    mockGets();
    renderDetail();

    await screen.findByText("Cannot log in");
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

  it("shows the assignee read-only (no picker) for agents", async () => {
    mockRole(Role.agent);
    mockGets();
    renderDetail();

    await screen.findByText("Cannot log in");
    expect(
      screen.queryByRole("combobox", { name: "Assign to agent" }),
    ).not.toBeInTheDocument();
    // The unassigned ticket fixture reads "Unassigned" as plain text.
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("links back to the ticket list", async () => {
    mockGets();
    renderDetail();

    const back = await screen.findByRole("link", { name: /back to tickets/i });
    expect(back).toHaveAttribute("href", "/tickets");
  });

  it("shows an error alert when the request fails", async () => {
    mockGets({ fail: true });
    renderDetail();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Failed to load ticket.");
  });
});
