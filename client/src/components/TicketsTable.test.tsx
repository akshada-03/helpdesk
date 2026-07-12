import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import axios, { type AxiosResponse } from "axios";

import type { TicketListItem, TicketListResponse } from "core/schemas/tickets.ts";
import { renderWithQuery } from "@/test/render";
import TicketsTable from "./TicketsTable";

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

function respondWith(tickets: TicketListItem[]) {
  mockedAxios.get.mockResolvedValue({
    data: { tickets } satisfies TicketListResponse,
  } as AxiosResponse<TicketListResponse>);
}

function respondPending() {
  mockedAxios.get.mockReturnValue(new Promise(() => {}));
}

function respondError() {
  mockedAxios.get.mockRejectedValue({});
}

// Newest first (matching the server's createdAt desc order).
const newer: TicketListItem = {
  id: "t-newer",
  subject: "Cannot log in",
  requesterEmail: "jane@example.com",
  requesterName: "Jane Doe",
  status: "open",
  category: "technical_question",
  createdAt: "2026-03-02T10:00:00.000Z",
};

const older: TicketListItem = {
  id: "t-older",
  subject: "Refund please",
  requesterEmail: "sam@example.com",
  requesterName: null,
  status: "resolved",
  category: null,
  createdAt: "2026-03-01T10:00:00.000Z",
};

describe("TicketsTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows skeleton placeholders while loading", () => {
    respondPending();
    const { container } = renderWithQuery(<TicketsTable />);

    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("hits the tickets endpoint", async () => {
    respondWith([newer]);
    renderWithQuery(<TicketsTable />);

    await screen.findByText("Cannot log in");
    expect(mockedAxios.get).toHaveBeenCalledWith("/api/tickets");
  });

  it("renders a row per ticket with subject, requester, status, and category", async () => {
    respondWith([newer, older]);
    renderWithQuery(<TicketsTable />);

    // Wait on a data value (loading skeleton shares the same headers).
    expect(await screen.findByText("Cannot log in")).toBeInTheDocument();

    for (const header of ["Subject", "Requester", "Status", "Category", "Created"]) {
      expect(
        screen.getByRole("columnheader", { name: header }),
      ).toBeInTheDocument();
    }

    // Ticket with a requester name shows name + email and its category label.
    const row = screen.getByText("Cannot log in").closest("tr")!;
    expect(within(row).getByText("Jane Doe")).toBeInTheDocument();
    expect(within(row).getByText("jane@example.com")).toBeInTheDocument();
    expect(within(row).getByText("open")).toBeInTheDocument();
    expect(within(row).getByText("Technical question")).toBeInTheDocument();
  });

  it("falls back to the email when there is no requester name, and '—' for no category", async () => {
    respondWith([older]);
    renderWithQuery(<TicketsTable />);

    const row = (await screen.findByText("Refund please")).closest("tr")!;
    // No name → the email is the only requester text shown.
    expect(within(row).getByText("sam@example.com")).toBeInTheDocument();
    expect(within(row).getByText("resolved")).toBeInTheDocument();
    expect(within(row).getByText("—")).toBeInTheDocument();
  });

  it("renders tickets in the order returned (newest first)", async () => {
    respondWith([newer, older]);
    renderWithQuery(<TicketsTable />);

    await screen.findByText("Cannot log in");

    const subjects = screen
      .getAllByRole("row")
      .slice(1) // drop the header row
      .map((row) => within(row).getAllByRole("cell")[0].textContent);
    expect(subjects).toEqual(["Cannot log in", "Refund please"]);
  });

  it("shows an empty state when there are no tickets", async () => {
    respondWith([]);
    renderWithQuery(<TicketsTable />);

    expect(await screen.findByText("No tickets yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an error alert when the request fails", async () => {
    respondError();
    renderWithQuery(<TicketsTable />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Failed to load tickets.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
