import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import type { TicketDetail as TicketDetailData } from "core/schemas/tickets.ts";
import { renderWithQuery } from "@/test/render";
import TicketDetail from "./TicketDetail";

// Rendered with a QueryClient (rather than a bare render) for the summarize action
// below the message, which owns a mutation. It issues no request until clicked, so
// nothing here needs a mocked Axios — TicketSummary.test.tsx covers the request.

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

describe("TicketDetail", () => {
  it("renders the subject, sender, message, and timestamps", () => {
    renderWithQuery(<TicketDetail ticket={ticket} />);

    expect(screen.getByText("Cannot log in")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(
      screen.getByText("I keep getting an error when I try to sign in."),
    ).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
  });

  it("offers to summarize the ticket, below the message", () => {
    renderWithQuery(<TicketDetail ticket={ticket} />);

    const message = screen.getByText(
      "I keep getting an error when I try to sign in.",
    );
    const summarize = screen.getByRole("button", { name: /summarize/i });

    // DOCUMENT_POSITION_FOLLOWING — the action reads as belonging to the message
    // above it, which is what makes it obvious what's being summarized.
    expect(
      message.compareDocumentPosition(summarize) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("falls back to the email when the requester has no name", () => {
    renderWithQuery(<TicketDetail ticket={{ ...ticket, requesterName: null }} />);

    // The email stands in for the sender name; it appears exactly once (no
    // separate name + email spans).
    expect(screen.getAllByText("jane@example.com")).toHaveLength(1);
    expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
  });
});
