import { z } from "zod/v4";

// SendGrid Inbound Parse posts these fields (among many others we ignore). Only
// the sender is required; everything else is best-effort. This schema is server-
// local because it models a provider's payload, not shared client input.
//
// Every field is length-capped: the payload is untrusted, so these bounds keep a
// malicious or malformed webhook from pushing an unbounded string into the DB (and
// through the AI classifier). Headers get tight caps (~RFC 5322's 998-octet line
// limit); bodies are roomier, with `html` largest since rich mail is the biggest.
//
// Only `from` is required — a message with no sender is unusable. The rest default
// to "" rather than being optional: SendGrid legitimately omits some (a text-only
// email has no `html`; a rich one may have no `text`), so instead of leaving them
// `undefined` we normalise a missing part to an empty string. Downstream, "" is
// treated the same as absent (subject falls back to a placeholder, an empty body
// yields null `bodyHtml`, etc.).
export const inboundEmailSchema = z.object({
  from: z.string().min(1, "Missing sender").max(255),
  subject: z.string().max(255).default(""),
  text: z.string().max(1000).default(""),
  html: z.string().max(2000).default(""),
  envelope: z.string().optional(),
  // RFC 5322 threading headers, used to route a customer's reply back to its ticket
  // rather than opening a new one (see lib/ticket-intake). All optional: a first-
  // contact email has none, and a provider that doesn't forward them just yields fresh
  // tickets. `references` accumulates the whole thread's Message-IDs, so it's capped
  // generously. The IMAP poller passes these directly; the webhook gets them here.
  messageId: z.string().max(998).optional(),
  inReplyTo: z.string().max(998).optional(),
  references: z.string().max(8000).optional(),
});

// The raw inbound shape (what a caller may pass): `from` is required, the rest are
// optional on input because their defaults fill them in during validation. Using
// the input type keeps `ticketFromInboundEmail` callable with a partial payload
// while the validated result (all fields present) is still assignable to it.
export type InboundEmail = z.input<typeof inboundEmailSchema>;

// Extracts an email + display name from a From header like
// `"Jane Doe <jane@example.com>"` or a bare `jane@example.com`.
export function parseFrom(from: string): { email: string; name: string | null } {
  const angle = from.match(/<([^>]+)>/);
  if (angle) {
    const email = angle[1].trim();
    const name = from
      .slice(0, angle.index)
      .trim()
      .replace(/^"|"$/g, "")
      .trim();
    return { email, name: name || null };
  }
  return { email: from.trim(), name: null };
}

// Best-effort plain text from an HTML body when no text/plain part was sent.
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Reads the authoritative sender address from the SendGrid `envelope` field (the
// SMTP MAIL FROM), if present and parseable. Returns null otherwise.
function envelopeFrom(envelope: string | undefined): string | null {
  if (!envelope) return null;
  try {
    const parsed = JSON.parse(envelope);
    if (typeof parsed?.from === "string" && parsed.from.length > 0) {
      return parsed.from;
    }
  } catch {
    // Malformed envelope — ignore.
  }
  return null;
}

// Derives the ticket fields from a validated inbound email. Pure (no I/O): the
// envelope sender wins for the address, the display name comes from the From
// header, the subject falls back to a placeholder, and the body prefers the plain
// text part, else tag-stripped HTML. `bodyHtml` preserves the original HTML part
// (if any) verbatim for rich rendering — it is untrusted markup and MUST be
// sanitized (DOMPurify) before it reaches the DOM.
export function ticketFromInboundEmail(data: InboundEmail): {
  subject: string;
  body: string;
  bodyHtml: string | null;
  requesterEmail: string;
  requesterName: string | null;
} {
  const parsed = parseFrom(data.from);
  const requesterEmail = envelopeFrom(data.envelope) ?? parsed.email;
  const subject = data.subject?.trim() || "(no subject)";
  const html = data.html?.trim();
  const body = data.text?.trim() || (html ? htmlToText(html) : "");
  const bodyHtml = html || null;

  return { subject, body, bodyHtml, requesterEmail, requesterName: parsed.name };
}
