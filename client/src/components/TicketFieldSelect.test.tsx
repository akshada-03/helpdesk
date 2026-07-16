import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios, { type AxiosResponse } from "axios";

import type { TicketDetail } from "core/schemas/tickets.ts";
import { renderWithQuery } from "@/test/render";
import TicketFieldSelect from "./TicketFieldSelect";

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

const statusOptions = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

function renderStatus() {
  return renderWithQuery(
    <TicketFieldSelect
      ticketId={103}
      value="open"
      ariaLabel="Update status"
      options={statusOptions}
      buildPatch={(v) => ({ status: v as "open" | "resolved" | "closed" })}
    />,
  );
}

describe("TicketFieldSelect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists the provided options", async () => {
    const u = userEvent.setup();
    renderStatus();

    await u.click(screen.getByRole("combobox", { name: "Update status" }));

    for (const { label } of statusOptions) {
      expect(
        await screen.findByRole("option", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("PATCHes the ticket with the body from buildPatch", async () => {
    mockedAxios.patch.mockResolvedValue({
      data: { status: "resolved" } as TicketDetail,
    } as AxiosResponse<TicketDetail>);
    const u = userEvent.setup();
    renderStatus();

    await u.click(screen.getByRole("combobox", { name: "Update status" }));
    await u.click(await screen.findByRole("option", { name: "Resolved" }));

    await waitFor(() =>
      expect(mockedAxios.patch).toHaveBeenCalledWith("/api/tickets/103", {
        status: "resolved",
      }),
    );
  });

  it("shows an error alert when the update fails", async () => {
    mockedAxios.patch.mockRejectedValue({});
    const u = userEvent.setup();
    renderStatus();

    await u.click(screen.getByRole("combobox", { name: "Update status" }));
    await u.click(await screen.findByRole("option", { name: "Closed" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Failed to update ticket.");
  });
});
