import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";

import type { TicketDetail as TicketDetailData } from "core/schemas/tickets.ts";
import { renderWithQuery } from "@/test/render";
import DeleteTicketDialog from "./DeleteTicketDialog";

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock Axios
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

const mockTicket: TicketDetailData = {
  id: 103,
  subject: "Cannot log in",
  body: "Help with authentication.",
  bodyHtml: null,
  requesterEmail: "user@example.com",
  requesterName: "Jane Doe",
  status: "open",
  category: "technical_question",
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-02T00:00:00.000Z",
  assignee: null,
};

describe("DeleteTicketDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders ticket deletion confirmation text when open", () => {
    renderWithQuery(
      <DeleteTicketDialog
        open={true}
        onOpenChange={vi.fn()}
        ticket={mockTicket}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Delete ticket" }),
    ).toBeInTheDocument();
    expect(screen.getByText("#103")).toBeInTheDocument();
    expect(screen.getByText("Cannot log in")).toBeInTheDocument();
  });

  it("calls API delete endpoint and navigates to /tickets on confirm", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockedAxios.delete.mockResolvedValueOnce({ status: 204 });

    renderWithQuery(
      <DeleteTicketDialog
        open={true}
        onOpenChange={onOpenChange}
        ticket={mockTicket}
      />,
    );

    const deleteButton = screen.getByRole("button", { name: "Delete ticket" });
    await user.click(deleteButton);

    expect(mockedAxios.delete).toHaveBeenCalledWith("/api/tickets/103");
  });
});
