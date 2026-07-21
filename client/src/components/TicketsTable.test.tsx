import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// `total` defaults to the number of rows (single page); pass it explicitly to
// simulate a result set that spans multiple pages.
function respondWith(tickets: TicketListItem[], total = tickets.length) {
  mockedAxios.get.mockResolvedValue({
    data: {
      tickets,
      total,
      page: 1,
      pageSize: 10,
    } satisfies TicketListResponse,
  } as AxiosResponse<TicketListResponse>);
}

// Every request also carries the default pagination params; spread this into the
// expected params so the filter/sort assertions stay focused on what they test.
const paged = (params: Record<string, unknown>) => ({
  ...params,
  page: 1,
  pageSize: 10,
});

function respondPending() {
  mockedAxios.get.mockReturnValue(new Promise(() => {}));
}

function respondError() {
  mockedAxios.get.mockRejectedValue({});
}

// Newest first (matching the server's createdAt desc order).
const newer: TicketListItem = {
  id: 102,
  subject: "Cannot log in",
  requesterEmail: "jane@example.com",
  requesterName: "Jane Doe",
  status: "open",
  category: "technical_question",
  createdAt: "2026-03-02T10:00:00.000Z",
  assignee: { id: "u-1", name: "Alice Agent" },
};

const older: TicketListItem = {
  id: 101,
  subject: "Refund please",
  requesterEmail: "sam@example.com",
  requesterName: null,
  status: "resolved",
  category: null,
  createdAt: "2026-03-01T10:00:00.000Z",
  assignee: null,
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

  it("hits the tickets endpoint, defaulting to newest first", async () => {
    respondWith([newer]);
    renderWithQuery(<TicketsTable />);

    await screen.findByText("Cannot log in");
    expect(mockedAxios.get).toHaveBeenCalledWith("/api/tickets", {
      params: paged({ sortBy: "createdAt", order: "desc" }),
    });
  });

  it("sorts on the server when a column header is clicked", async () => {
    respondWith([newer, older]);
    renderWithQuery(<TicketsTable />);

    await screen.findByText("Cannot log in");

    // First click sorts by that column ascending.
    fireEvent.click(screen.getByRole("button", { name: "Subject" }));
    await waitFor(() =>
      expect(mockedAxios.get).toHaveBeenLastCalledWith("/api/tickets", {
        params: paged({ sortBy: "subject", order: "asc" }),
      }),
    );

    // Clicking the same column again toggles to descending.
    fireEvent.click(screen.getByRole("button", { name: "Subject" }));
    await waitFor(() =>
      expect(mockedAxios.get).toHaveBeenLastCalledWith("/api/tickets", {
        params: paged({ sortBy: "subject", order: "desc" }),
      }),
    );
  });

  it("renders a row per ticket with subject, requester, status, and category", async () => {
    respondWith([newer, older]);
    renderWithQuery(<TicketsTable />);

    // Wait on a data value (loading skeleton shares the same headers).
    expect(await screen.findByText("Cannot log in")).toBeInTheDocument();

    for (const header of ["Subject", "Sender", "Status", "Category", "Created"]) {
      expect(
        screen.getByRole("columnheader", { name: header }),
      ).toBeInTheDocument();
    }

    // Ticket with a requester name shows name + email and its category label.
    const row = screen.getByText("Cannot log in").closest("tr")!;
    expect(within(row).getByText("Jane Doe")).toBeInTheDocument();
    expect(within(row).getByText("jane@example.com")).toBeInTheDocument();
    expect(within(row).getByText("open")).toBeInTheDocument();
    expect(within(row).getByText("technical question")).toBeInTheDocument();
  });

  it("links each subject to its ticket detail page", async () => {
    respondWith([newer]);
    renderWithQuery(<TicketsTable />);

    const link = await screen.findByRole("link", { name: "Cannot log in" });
    expect(link).toHaveAttribute("href", "/tickets/102");
  });

  it("shows the assignee name, or 'Unassigned' when there is none", async () => {
    respondWith([newer, older]);
    renderWithQuery(<TicketsTable />);

    await screen.findByText("Cannot log in");
    expect(
      screen.getByRole("columnheader", { name: "Assigned to" }),
    ).toBeInTheDocument();

    const assigned = screen.getByText("Cannot log in").closest("tr")!;
    expect(within(assigned).getByText("Alice Agent")).toBeInTheDocument();

    const unassigned = screen.getByText("Refund please").closest("tr")!;
    expect(within(unassigned).getByText("Unassigned")).toBeInTheDocument();
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

  it("sends the status param when a status filter is picked", async () => {
    respondWith([newer]);
    const u = userEvent.setup();
    renderWithQuery(<TicketsTable />);

    await screen.findByText("Cannot log in");

    await u.click(screen.getByRole("combobox", { name: "Filter by status" }));
    await u.click(await screen.findByRole("option", { name: "resolved" }));

    await waitFor(() =>
      expect(mockedAxios.get).toHaveBeenLastCalledWith("/api/tickets", {
        params: paged({ sortBy: "createdAt", order: "desc", status: "resolved" }),
      }),
    );
  });

  it("sends the category param when a category filter is picked", async () => {
    respondWith([newer]);
    const u = userEvent.setup();
    renderWithQuery(<TicketsTable />);

    await screen.findByText("Cannot log in");

    await u.click(screen.getByRole("combobox", { name: "Filter by category" }));
    await u.click(
      await screen.findByRole("option", { name: "technical question" }),
    );

    await waitFor(() =>
      expect(mockedAxios.get).toHaveBeenLastCalledWith("/api/tickets", {
        params: paged({
          sortBy: "createdAt",
          order: "desc",
          category: "technical_question",
        }),
      }),
    );
  });

  it("clears an active filter, dropping the param", async () => {
    respondWith([newer]);
    const u = userEvent.setup();
    renderWithQuery(<TicketsTable />);

    await screen.findByText("Cannot log in");

    await u.click(screen.getByRole("combobox", { name: "Filter by status" }));
    await u.click(await screen.findByRole("option", { name: "open" }));
    await waitFor(() =>
      expect(mockedAxios.get).toHaveBeenLastCalledWith("/api/tickets", {
        params: paged({ sortBy: "createdAt", order: "desc", status: "open" }),
      }),
    );

    await u.click(screen.getByRole("button", { name: /clear filters/i }));
    await waitFor(() =>
      expect(mockedAxios.get).toHaveBeenLastCalledWith("/api/tickets", {
        params: paged({ sortBy: "createdAt", order: "desc" }),
      }),
    );
  });

  it("sends the (trimmed) search term as a param after debouncing", async () => {
    respondWith([newer]);
    const u = userEvent.setup();
    renderWithQuery(<TicketsTable />);

    await screen.findByText("Cannot log in");

    await u.type(screen.getByRole("searchbox", { name: "Search tickets" }), "  login  ");

    await waitFor(() =>
      expect(mockedAxios.get).toHaveBeenLastCalledWith("/api/tickets", {
        params: paged({ sortBy: "createdAt", order: "desc", search: "login" }),
      }),
    );
  });

  it("clears the search term along with the other filters", async () => {
    respondWith([newer]);
    const u = userEvent.setup();
    renderWithQuery(<TicketsTable />);

    await screen.findByText("Cannot log in");

    const box = screen.getByRole("searchbox", { name: "Search tickets" });
    await u.type(box, "refund");
    await waitFor(() =>
      expect(mockedAxios.get).toHaveBeenLastCalledWith("/api/tickets", {
        params: paged({ sortBy: "createdAt", order: "desc", search: "refund" }),
      }),
    );

    await u.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(box).toHaveValue("");
    await waitFor(() =>
      expect(mockedAxios.get).toHaveBeenLastCalledWith("/api/tickets", {
        params: paged({ sortBy: "createdAt", order: "desc" }),
      }),
    );
  });

  it("shows the row range and total, and pages forward on Next", async () => {
    // 25 tickets total, first page of 10 returned.
    respondWith([newer, older], 25);
    const u = userEvent.setup();
    renderWithQuery(<TicketsTable />);

    await screen.findByText("Cannot log in");
    expect(screen.getByText("Showing 1–2 of 25")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    // On the first page, Previous is disabled.
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await u.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(mockedAxios.get).toHaveBeenLastCalledWith("/api/tickets", {
        params: { sortBy: "createdAt", order: "desc", page: 2, pageSize: 10 },
      }),
    );
  });

  it("resets to the first page when a filter changes", async () => {
    respondWith([newer, older], 25);
    const u = userEvent.setup();
    renderWithQuery(<TicketsTable />);

    await screen.findByText("Cannot log in");
    // Move to page 2 first.
    await u.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(mockedAxios.get).toHaveBeenLastCalledWith("/api/tickets", {
        params: { sortBy: "createdAt", order: "desc", page: 2, pageSize: 10 },
      }),
    );

    // Changing the status filter should snap back to page 1.
    await u.click(screen.getByRole("combobox", { name: "Filter by status" }));
    await u.click(await screen.findByRole("option", { name: "open" }));
    await waitFor(() =>
      expect(mockedAxios.get).toHaveBeenLastCalledWith("/api/tickets", {
        params: paged({ sortBy: "createdAt", order: "desc", status: "open" }),
      }),
    );
  });

  it("shows a filtered empty state when no tickets match the filter", async () => {
    respondWith([]);
    const u = userEvent.setup();
    renderWithQuery(<TicketsTable />);

    await screen.findByText("No tickets yet.");

    await u.click(screen.getByRole("combobox", { name: "Filter by status" }));
    await u.click(await screen.findByRole("option", { name: "closed" }));

    expect(
      await screen.findByText("No tickets match the current filters."),
    ).toBeInTheDocument();
  });
});
