import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios, { type AxiosResponse } from "axios";

import type { AgentListResponse } from "core/schemas/users.ts";
import type { TicketAssignee, TicketDetail } from "core/schemas/tickets.ts";
import { renderWithQuery } from "@/test/render";
import AssigneeSelect from "./AssigneeSelect";

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

const agents = [
  { id: "u-1", name: "Alice Agent", email: "alice@example.com" },
  { id: "u-2", name: "Bob Agent", email: "bob@example.com" },
];

function mockAgents() {
  mockedAxios.get.mockResolvedValue({
    data: { agents } satisfies AgentListResponse,
  } as AxiosResponse<AgentListResponse>);
}

// A successful PATCH echoes back an updated ticket; the component only reads it to
// seed the cache, so a minimal shape is enough here.
function mockAssignSuccess(assignee: TicketAssignee | null) {
  mockedAxios.patch.mockResolvedValue({
    data: { assignee } as TicketDetail,
  } as AxiosResponse<TicketDetail>);
}

function renderSelect(assignee: TicketAssignee | null = null) {
  return renderWithQuery(
    <AssigneeSelect ticketId="t-1" assignee={assignee} />,
  );
}

describe("AssigneeSelect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists every agent plus an Unassigned option", async () => {
    mockAgents();
    const u = userEvent.setup();
    renderSelect(null);

    await u.click(
      await screen.findByRole("combobox", { name: "Assign to agent" }),
    );

    expect(
      await screen.findByRole("option", { name: "Unassigned" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Alice Agent" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bob Agent" })).toBeInTheDocument();
  });

  it("pre-selects the ticket's current assignee", async () => {
    mockAgents();
    const u = userEvent.setup();
    renderSelect({ id: "u-1", name: "Alice Agent" });

    await u.click(
      await screen.findByRole("combobox", { name: "Assign to agent" }),
    );

    // Radix marks the selected item with data-state="checked".
    expect(
      await screen.findByRole("option", { name: "Alice Agent" }),
    ).toHaveAttribute("data-state", "checked");
  });

  it("PATCHes the ticket with the chosen agent id", async () => {
    mockAgents();
    mockAssignSuccess({ id: "u-2", name: "Bob Agent" });
    const u = userEvent.setup();
    renderSelect(null);

    await u.click(
      await screen.findByRole("combobox", { name: "Assign to agent" }),
    );
    await u.click(await screen.findByRole("option", { name: "Bob Agent" }));

    await waitFor(() =>
      expect(mockedAxios.patch).toHaveBeenCalledWith("/api/tickets/t-1", {
        assigneeId: "u-2",
      }),
    );
  });

  it("PATCHes with null when cleared to Unassigned", async () => {
    mockAgents();
    mockAssignSuccess(null);
    const u = userEvent.setup();
    renderSelect({ id: "u-1", name: "Alice Agent" });

    await u.click(
      await screen.findByRole("combobox", { name: "Assign to agent" }),
    );
    await u.click(await screen.findByRole("option", { name: "Unassigned" }));

    await waitFor(() =>
      expect(mockedAxios.patch).toHaveBeenCalledWith("/api/tickets/t-1", {
        assigneeId: null,
      }),
    );
  });

  it("shows an error alert when the assignment fails", async () => {
    mockAgents();
    mockedAxios.patch.mockRejectedValue({});
    const u = userEvent.setup();
    renderSelect(null);

    await u.click(
      await screen.findByRole("combobox", { name: "Assign to agent" }),
    );
    await u.click(await screen.findByRole("option", { name: "Alice Agent" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Failed to update assignee.");
  });
});
