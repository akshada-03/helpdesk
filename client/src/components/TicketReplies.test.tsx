import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios, { type AxiosResponse } from "axios";

import type { TicketReply } from "core/schemas/tickets.ts";
import { renderWithQuery } from "@/test/render";
import TicketReplies from "./TicketReplies";

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

const reply: TicketReply = {
  id: "r-1",
  body: "Thanks for reaching out — can you share a screenshot?",
  senderType: "agent",
  createdAt: "2026-03-03T12:00:00.000Z",
  author: { id: "u-1", name: "Alice Agent" },
};

const customerReply: TicketReply = {
  id: "r-2",
  body: "Here's the screenshot you asked for.",
  senderType: "customer",
  createdAt: "2026-03-03T13:00:00.000Z",
  author: null,
};

describe("TicketReplies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and renders the reply thread", async () => {
    mockedAxios.get.mockResolvedValue({ data: [reply] } as AxiosResponse);
    renderWithQuery(<TicketReplies ticketId="t-1" />);

    expect(await screen.findByText(reply.body)).toBeInTheDocument();
    expect(screen.getByText("Alice Agent")).toBeInTheDocument();
    expect(mockedAxios.get).toHaveBeenCalledWith("/api/tickets/t-1/replies");
  });

  it("labels agent and customer replies distinctly", async () => {
    mockedAxios.get.mockResolvedValue({
      data: [reply, customerReply],
    } as AxiosResponse);
    renderWithQuery(<TicketReplies ticketId="t-1" />);

    await screen.findByText(reply.body);
    // Agent reply carries the author's name + an "Agent" badge; the customer
    // reply (no app-User author) is labelled "Customer".
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(screen.getByText(customerReply.body)).toBeInTheDocument();
  });

  it("shows an empty state when there are no replies", async () => {
    mockedAxios.get.mockResolvedValue({ data: [] } as AxiosResponse);
    renderWithQuery(<TicketReplies ticketId="t-1" />);

    expect(await screen.findByText("No replies yet.")).toBeInTheDocument();
  });

  it("shows an error alert when the thread fails to load", async () => {
    mockedAxios.get.mockRejectedValue({});
    renderWithQuery(<TicketReplies ticketId="t-1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to load replies.",
    );
  });

  it("blocks submitting an empty reply and shows a validation message", async () => {
    mockedAxios.get.mockResolvedValue({ data: [] } as AxiosResponse);
    const u = userEvent.setup();
    renderWithQuery(<TicketReplies ticketId="t-1" />);

    await screen.findByText("No replies yet.");
    await u.click(screen.getByRole("button", { name: /send reply/i }));

    expect(await screen.findByText("Reply cannot be empty")).toBeInTheDocument();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("posts a new reply, refetches the thread, and clears the form", async () => {
    // Empty on first load; the post triggers a refetch that returns the reply.
    mockedAxios.get
      .mockResolvedValueOnce({ data: [] } as AxiosResponse)
      .mockResolvedValue({ data: [reply] } as AxiosResponse);
    mockedAxios.post.mockResolvedValue({ data: reply } as AxiosResponse);
    const u = userEvent.setup();
    renderWithQuery(<TicketReplies ticketId="t-1" />);

    await screen.findByText("No replies yet.");
    const box = screen.getByRole("textbox", { name: "Reply message" });
    await u.type(box, "Here is my reply");
    await u.click(screen.getByRole("button", { name: /send reply/i }));

    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith("/api/tickets/t-1/replies", {
        body: "Here is my reply",
      }),
    );
    // The refetched thread shows the reply and the compose box is reset.
    expect(await screen.findByText(reply.body)).toBeInTheDocument();
    expect(box).toHaveValue("");
  });

  it("shows an error alert when sending a reply fails", async () => {
    mockedAxios.get.mockResolvedValue({ data: [] } as AxiosResponse);
    mockedAxios.post.mockRejectedValue({});
    const u = userEvent.setup();
    renderWithQuery(<TicketReplies ticketId="t-1" />);

    await screen.findByText("No replies yet.");
    await u.type(
      screen.getByRole("textbox", { name: "Reply message" }),
      "Here is my reply",
    );
    await u.click(screen.getByRole("button", { name: /send reply/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to send reply.",
    );
  });
});
