import { describe, expect, test } from "bun:test";

import {
  htmlToText,
  inboundEmailSchema,
  parseFrom,
  ticketFromInboundEmail,
} from "./inbound-email";

describe("parseFrom", () => {
  test("extracts display name and email from a From header", () => {
    expect(parseFrom("Jane Doe <jane@example.com>")).toEqual({
      name: "Jane Doe",
      email: "jane@example.com",
    });
  });

  test("strips surrounding quotes from the display name", () => {
    expect(parseFrom('"Doe, Jane" <jane@example.com>')).toEqual({
      name: "Doe, Jane",
      email: "jane@example.com",
    });
  });

  test("returns a null name for a bare address", () => {
    expect(parseFrom("jane@example.com")).toEqual({
      name: null,
      email: "jane@example.com",
    });
  });
});

describe("htmlToText", () => {
  test("strips tags and collapses whitespace", () => {
    expect(htmlToText("<p>Hello <b>there</b></p>")).toBe("Hello there");
  });
});

describe("ticketFromInboundEmail", () => {
  test("prefers the envelope sender over the From-header address", () => {
    const result = ticketFromInboundEmail({
      from: "Jane Doe <display@example.com>",
      subject: "Hi",
      text: "Hello",
      envelope: JSON.stringify({ from: "envelope@example.com" }),
    });
    expect(result.requesterEmail).toBe("envelope@example.com");
    expect(result.requesterName).toBe("Jane Doe");
  });

  test("falls back to the From address when there is no envelope", () => {
    const result = ticketFromInboundEmail({ from: "bare@example.com" });
    expect(result.requesterEmail).toBe("bare@example.com");
    expect(result.requesterName).toBeNull();
  });

  test("ignores a malformed envelope and uses the From address", () => {
    const result = ticketFromInboundEmail({
      from: "jane@example.com",
      envelope: "not json",
    });
    expect(result.requesterEmail).toBe("jane@example.com");
  });

  test("falls back to '(no subject)' when subject is missing or blank", () => {
    expect(ticketFromInboundEmail({ from: "a@b.com" }).subject).toBe(
      "(no subject)",
    );
    expect(
      ticketFromInboundEmail({ from: "a@b.com", subject: "   " }).subject,
    ).toBe("(no subject)");
  });

  test("prefers the text body, trimmed", () => {
    expect(
      ticketFromInboundEmail({ from: "a@b.com", text: "  hello  " }).body,
    ).toBe("hello");
  });

  test("derives the body from HTML when there is no text part", () => {
    const result = ticketFromInboundEmail({
      from: "a@b.com",
      html: "<p>Hello <b>there</b></p>",
    });
    expect(result.body).toBe("Hello there");
  });

  test("preserves the raw HTML part in bodyHtml (trimmed)", () => {
    const result = ticketFromInboundEmail({
      from: "a@b.com",
      html: "  <p>Hello <b>there</b></p>  ",
    });
    expect(result.bodyHtml).toBe("<p>Hello <b>there</b></p>");
  });

  test("leaves bodyHtml null when the email has no HTML part", () => {
    expect(ticketFromInboundEmail({ from: "a@b.com", text: "hi" }).bodyHtml).toBe(
      null,
    );
  });

  test("yields an empty body and null bodyHtml when neither part is present", () => {
    const result = ticketFromInboundEmail({ from: "a@b.com" });
    expect(result.body).toBe("");
    expect(result.bodyHtml).toBe(null);
  });
});

describe("inboundEmailSchema", () => {
  test("rejects a payload with no sender", () => {
    const result = inboundEmailSchema.safeParse({ subject: "Hi" });
    expect(result.success).toBe(false);
  });

  test("accepts a minimal payload with just a sender", () => {
    const result = inboundEmailSchema.safeParse({ from: "jane@example.com" });
    expect(result.success).toBe(true);
  });
});
