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
  id: 1,
  body: "Thanks for reaching out — can you share a screenshot?",
  bodyHtml: null,
  senderType: "agent",
  createdAt: "2026-03-03T12:00:00.000Z",
  author: { id: "u-1", name: "Alice Agent" },
};

const customerReply: TicketReply = {
  id: 2,
  body: "Here's the screenshot you asked for.",
  bodyHtml: null,
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
    renderWithQuery(<TicketReplies ticketId={103} />);

    expect(await screen.findByText(reply.body)).toBeInTheDocument();
    expect(screen.getByText("Alice Agent")).toBeInTheDocument();
    expect(mockedAxios.get).toHaveBeenCalledWith("/api/tickets/103/replies");
  });

  it("labels agent and customer replies distinctly", async () => {
    mockedAxios.get.mockResolvedValue({
      data: [reply, customerReply],
    } as AxiosResponse);
    renderWithQuery(<TicketReplies ticketId={103} />);

    await screen.findByText(reply.body);
    // Agent reply carries the author's name + an "Agent" badge; the customer
    // reply (no app-User author) is labelled "Customer".
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(screen.getByText(customerReply.body)).toBeInTheDocument();
  });

  it("renders a reply's HTML body sanitized, stripping XSS", async () => {
    mockedAxios.get.mockResolvedValue({
      data: [
        {
          ...customerReply,
          body: "plain fallback",
          bodyHtml:
            '<p>See <strong>this</strong></p><img src=x onerror="alert(1)"><script>alert(2)</script>',
        },
      ],
    } as AxiosResponse);
    renderWithQuery(<TicketReplies ticketId={103} />);

    // The safe formatting survives…
    const strong = await screen.findByText("this");
    expect(strong.tagName).toBe("STRONG");
    // …the plain-text fallback is not used when HTML is present…
    expect(screen.queryByText("plain fallback")).not.toBeInTheDocument();
    // …and the dangerous markup never reaches the DOM.
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("img")?.hasAttribute("onerror")).toBe(false);
  });

  it("shows an empty state when there are no replies", async () => {
    mockedAxios.get.mockResolvedValue({ data: [] } as AxiosResponse);
    renderWithQuery(<TicketReplies ticketId={103} />);

    expect(await screen.findByText("No replies yet.")).toBeInTheDocument();
  });

  it("shows an error alert when the thread fails to load", async () => {
    mockedAxios.get.mockRejectedValue({});
    renderWithQuery(<TicketReplies ticketId={103} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to load replies.",
    );
  });

  it("disables send until there is a reply, rather than validating on submit", async () => {
    mockedAxios.get.mockResolvedValue({ data: [] } as AxiosResponse);
    const u = userEvent.setup();
    renderWithQuery(<TicketReplies ticketId={103} />);

    await screen.findByText("No replies yet.");
    const send = screen.getByRole("button", { name: /send reply/i });
    expect(send).toBeDisabled();

    // Clicking the disabled button does nothing — no request, and crucially no
    // validation error (the empty state is communicated by the disabled button).
    await u.click(send);
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(screen.queryByText("Reply cannot be empty")).not.toBeInTheDocument();

    // Typing enables it.
    await u.type(
      screen.getByRole("textbox", { name: "Reply message" }),
      "Here is my reply",
    );
    expect(send).toBeEnabled();
  });

  it("keeps send disabled for a whitespace-only draft", async () => {
    mockedAxios.get.mockResolvedValue({ data: [] } as AxiosResponse);
    const u = userEvent.setup();
    renderWithQuery(<TicketReplies ticketId={103} />);

    await screen.findByText("No replies yet.");
    // The schema trims before checking, so spaces alone must not count as a reply.
    await u.type(screen.getByRole("textbox", { name: "Reply message" }), "   ");

    expect(screen.getByRole("button", { name: /send reply/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /polish/i })).toBeDisabled();
  });

  it("posts a new reply, refetches the thread, and clears the form", async () => {
    // Empty on first load; the post triggers a refetch that returns the reply.
    mockedAxios.get
      .mockResolvedValueOnce({ data: [] } as AxiosResponse)
      .mockResolvedValue({ data: [reply] } as AxiosResponse);
    mockedAxios.post.mockResolvedValue({ data: reply } as AxiosResponse);
    const u = userEvent.setup();
    renderWithQuery(<TicketReplies ticketId={103} />);

    await screen.findByText("No replies yet.");
    const box = screen.getByRole("textbox", { name: "Reply message" });
    await u.type(box, "Here is my reply");
    await u.click(screen.getByRole("button", { name: /send reply/i }));

    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith("/api/tickets/103/replies", {
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
    renderWithQuery(<TicketReplies ticketId={103} />);

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

  describe("polish", () => {
    // Renders the component with an empty thread and types `draft` into the
    // compose box, returning it for further interaction.
    async function composeDraft(draft: string) {
      mockedAxios.get.mockResolvedValue({ data: [] } as AxiosResponse);
      const u = userEvent.setup();
      renderWithQuery(<TicketReplies ticketId={103} />);

      await screen.findByText("No replies yet.");
      const box = screen.getByRole("textbox", { name: "Reply message" });
      await u.type(box, draft);
      return { u, box };
    }

    it("is disabled until there is a draft to polish", async () => {
      mockedAxios.get.mockResolvedValue({ data: [] } as AxiosResponse);
      renderWithQuery(<TicketReplies ticketId={103} />);

      await screen.findByText("No replies yet.");
      expect(screen.getByRole("button", { name: /polish/i })).toBeDisabled();
    });

    it("replaces the draft with the polished text without sending it", async () => {
      mockedAxios.post.mockResolvedValue({
        data: { body: "We are on it — sorry for the trouble." },
      } as AxiosResponse);
      const { u, box } = await composeDraft("we r on it");

      await u.click(screen.getByRole("button", { name: /polish/i }));

      await waitFor(() =>
        expect(box).toHaveValue("We are on it — sorry for the trouble."),
      );
      // Polishing hits only the polish endpoint — the reply is NOT posted.
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        "/api/tickets/103/replies/polish",
        { body: "we r on it" },
      );
    });

    it("keeps the polished text sendable", async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { body: "Polished text." } } as AxiosResponse)
        .mockResolvedValueOnce({ data: reply } as AxiosResponse);
      const { u } = await composeDraft("rough draft");

      await u.click(screen.getByRole("button", { name: /polish/i }));
      await waitFor(() =>
        expect(
          screen.getByRole("textbox", { name: "Reply message" }),
        ).toHaveValue("Polished text."),
      );
      await u.click(screen.getByRole("button", { name: /send reply/i }));

      await waitFor(() =>
        expect(mockedAxios.post).toHaveBeenLastCalledWith(
          "/api/tickets/103/replies",
          { body: "Polished text." },
        ),
      );
    });

    it("shows an error alert and keeps the draft when polishing fails", async () => {
      mockedAxios.post.mockRejectedValue({});
      const { u, box } = await composeDraft("my draft");

      await u.click(screen.getByRole("button", { name: /polish/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Failed to polish the reply.",
      );
      // The agent's work survives a failed polish so they can still send it.
      expect(box).toHaveValue("my draft");
    });
  });
});
