import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import type { TicketDetail as TicketDetailData } from "core/schemas/tickets.ts";
import TicketDetail from "./TicketDetail";

const ticket: TicketDetailData = {
  id: "t-1",
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
    render(<TicketDetail ticket={ticket} />);

    expect(screen.getByText("Cannot log in")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(
      screen.getByText("I keep getting an error when I try to sign in."),
    ).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
  });

  it("falls back to the email when the requester has no name", () => {
    render(<TicketDetail ticket={{ ...ticket, requesterName: null }} />);

    // The email stands in for the sender name; it appears exactly once (no
    // separate name + email spans).
    expect(screen.getAllByText("jane@example.com")).toHaveLength(1);
    expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
  });
});
