import { Router } from "express";
import multer from "multer";
import { z } from "zod/v4";

import prisma from "../db";
import { WEBHOOK_SECRET } from "../lib/env";
import { validate } from "../lib/validate";

export const webhooksRouter = Router();

// Parses multipart form fields into req.body (no file handling — SendGrid
// attachments are out of scope).
const upload = multer();

// SendGrid Inbound Parse posts these fields (among many others we ignore). Only
// the sender is required; everything else is best-effort. This schema is server-
// local because it models a provider's payload, not shared client input.
const inboundEmailSchema = z.object({
  from: z.string().min(1, "Missing sender"),
  subject: z.string().optional(),
  text: z.string().optional(),
  html: z.string().optional(),
  envelope: z.string().optional(),
});

// Extracts an email + display name from a From header like
// `"Jane Doe <jane@example.com>"` or a bare `jane@example.com`.
function parseFrom(from: string): { email: string; name: string | null } {
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
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Inbound email → ticket. This endpoint is public (mounted above requireAuth) so
// the email provider can reach it. When WEBHOOK_SECRET is set, a matching
// `?token=` is required — keep it unset in dev/E2E so local posts/tests work.
webhooksRouter.post("/inbound-email", upload.none(), async (req, res) => {
  if (WEBHOOK_SECRET && req.query.token !== WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const data = validate(inboundEmailSchema, req.body, res);
  if (!data) return;

  const parsed = parseFrom(data.from);

  // Prefer the envelope sender (the actual SMTP MAIL FROM) for the address; fall
  // back to the address parsed from the From header.
  let requesterEmail = parsed.email;
  if (data.envelope) {
    try {
      const envelope = JSON.parse(data.envelope);
      if (typeof envelope?.from === "string" && envelope.from.length > 0) {
        requesterEmail = envelope.from;
      }
    } catch {
      // Malformed envelope — ignore and keep the parsed From address.
    }
  }

  const subject = data.subject?.trim() || "(no subject)";
  const body = data.text?.trim() || (data.html ? htmlToText(data.html) : "");

  const ticket = await prisma.ticket.create({
    data: {
      id: crypto.randomUUID(),
      subject,
      body,
      requesterEmail,
      requesterName: parsed.name,
      // status defaults to `open`; category is left null until AI classification.
    },
  });

  // SendGrid treats any 2xx as successful delivery; a non-2xx triggers retries.
  res.status(200).json({ ticketId: ticket.id });
});
