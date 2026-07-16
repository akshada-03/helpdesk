import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios, { type AxiosResponse } from "axios";

import { renderWithQuery } from "@/test/render";
import TicketSummary from "./TicketSummary";

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

describe("TicketSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("summarizes nothing until asked", () => {
    renderWithQuery(<TicketSummary ticketId={103} />);

    // A summary costs a model call, so it must not fire on render.
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(screen.queryByText("Summary")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /summarize/i })).toBeEnabled();
  });

  it("requests a summary on click and renders it", async () => {
    mockedAxios.post.mockResolvedValue({
      data: { summary: "Customer cannot log in; agent asked for a screenshot." },
    } as AxiosResponse);
    const u = userEvent.setup();
    renderWithQuery(<TicketSummary ticketId={103} />);

    await u.click(screen.getByRole("button", { name: /summarize/i }));

    expect(
      await screen.findByText(
        "Customer cannot log in; agent asked for a screenshot.",
      ),
    ).toBeInTheDocument();
    // The ticket id is the whole request — the thread is read server-side.
    expect(mockedAxios.post).toHaveBeenCalledWith("/api/tickets/103/summary");
  });

  it("regenerates on every click rather than reusing the first summary", async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { summary: "First summary." } } as AxiosResponse)
      .mockResolvedValueOnce({
        data: { summary: "Second summary, now that the customer replied." },
      } as AxiosResponse);
    const u = userEvent.setup();
    renderWithQuery(<TicketSummary ticketId={103} />);

    await u.click(screen.getByRole("button", { name: /summarize/i }));
    expect(await screen.findByText("First summary.")).toBeInTheDocument();

    // Once there's a summary, the button offers to replace it…
    await u.click(screen.getByRole("button", { name: /regenerate summary/i }));

    // …and does: a second call, and the stale text is gone. This is the whole
    // point of not caching — the thread may have moved on since the first click.
    expect(
      await screen.findByText("Second summary, now that the customer replied."),
    ).toBeInTheDocument();
    expect(screen.queryByText("First summary.")).not.toBeInTheDocument();
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it("shows an error alert when summarizing fails", async () => {
    mockedAxios.post.mockRejectedValue({});
    const u = userEvent.setup();
    renderWithQuery(<TicketSummary ticketId={103} />);

    await u.click(screen.getByRole("button", { name: /summarize/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to summarize the ticket.",
    );
    expect(screen.queryByText("Summary")).not.toBeInTheDocument();
  });

  it("keeps the previous summary on screen while regenerating", async () => {
    let resolveSecond: (value: AxiosResponse) => void;
    mockedAxios.post
      .mockResolvedValueOnce({ data: { summary: "First summary." } } as AxiosResponse)
      .mockReturnValueOnce(
        new Promise<AxiosResponse>((resolve) => {
          resolveSecond = resolve;
        }),
      );
    const u = userEvent.setup();
    renderWithQuery(<TicketSummary ticketId={103} />);

    await u.click(screen.getByRole("button", { name: /summarize/i }));
    await screen.findByText("First summary.");
    await u.click(screen.getByRole("button", { name: /regenerate summary/i }));

    // Mid-flight the button is busy but the old summary is still readable rather
    // than blanking out.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /regenerate summary/i })).toBeDisabled(),
    );
    expect(screen.getByText("First summary.")).toBeInTheDocument();

    resolveSecond!({ data: { summary: "Second summary." } } as AxiosResponse);
    expect(await screen.findByText("Second summary.")).toBeInTheDocument();
  });
});
