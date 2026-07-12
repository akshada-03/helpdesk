import { z } from "zod/v4";

// SendGrid Inbound Parse posts these fields (among many others we ignore). Only
// the sender is required; everything else is best-effort. This schema is server-
// local because it models a provider's payload, not shared client input.
export const inboundEmailSchema = z.object({
  from: z.string().min(1, "Missing sender"),
  subject: z.string().optional(),
  text: z.string().optional(),
  html: z.string().optional(),
  envelope: z.string().optional(),
});

export type InboundEmail = z.infer<typeof inboundEmailSchema>;

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
// text part, else tag-stripped HTML.
export function ticketFromInboundEmail(data: InboundEmail): {
  subject: string;
  body: string;
  requesterEmail: string;
  requesterName: string | null;
} {
  const parsed = parseFrom(data.from);
  const requesterEmail = envelopeFrom(data.envelope) ?? parsed.email;
  const subject = data.subject?.trim() || "(no subject)";
  const body = data.text?.trim() || (data.html ? htmlToText(data.html) : "");

  return { subject, body, requesterEmail, requesterName: parsed.name };
}
