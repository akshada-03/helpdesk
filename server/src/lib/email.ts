import nodemailer, { type Transporter } from "nodemailer";

import {
  SMTP_FROM,
  SMTP_HOST,
  SMTP_PASS,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
} from "./env";

// Outbound email via nodemailer/SMTP. Mirrors lib/ai.ts's shape: the transport is
// built lazily from env, and the whole feature is optional — an unconfigured server
// runs normally and just never sends mail (callers check isEmailConfigured first, or
// the reply-email worker no-ops). Any SMTP server works; a free Gmail App Password is
// the zero-cost default (see server/.env.example).

// Configured only when we have enough to open an SMTP session: a host, a login, and a
// password. Port/secure/from all have sensible fallbacks, so they aren't required.
export function isEmailConfigured(): boolean {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

// The address outgoing mail is sent from. Defaults to the login mailbox, which is
// what most providers require anyway (Gmail rewrites a mismatched From to the
// authenticated user).
export function emailFrom(): string {
  return SMTP_FROM || SMTP_USER || "";
}

let transporter: Transporter | null = null;

// Built once and reused: nodemailer pools connections per transport, so recreating it
// per send would drop that. Re-checks the env inline (rather than via
// isEmailConfigured) so TypeScript narrows the vars to `string`.
function transport(): Transporter {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      "Email is not configured — set SMTP_HOST, SMTP_USER, and SMTP_PASS in server/.env",
    );
  }
  if (transporter) return transporter;

  // Default to 587 (STARTTLS). `secure` means implicit TLS (port 465); if unset we
  // infer it from the port so `SMTP_PORT=465` alone works without also setting the flag.
  const port = SMTP_PORT ? Number(SMTP_PORT) : 587;
  const secure =
    SMTP_SECURE !== undefined ? SMTP_SECURE === "true" : port === 465;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // Force IPv4 lookup: cloud platforms like Render often fail or time out on
    // IPv6 connections to smtp.gmail.com (ECONNREFUSED / ETIMEDOUT).
    family: 4,
  } as nodemailer.TransportOptions);
  return transporter;
}

// Sends one email. Throws on failure — callers that must not fail (the request path)
// enqueue a job and let pg-boss retry; the worker is where a throw is handled.
//
// `inReplyTo`/`references` thread the message in the recipient's client: we pass a
// synthetic per-ticket id so every message we send about a ticket shares one thread
// root. (It won't attach to the customer's original message — we don't persist that
// Message-ID — but it keeps our own back-and-forth grouped, and most clients also
// thread on the "Re:" subject.)
export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
}): Promise<void> {
  await transport().sendMail({
    from: emailFrom(),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    inReplyTo: input.inReplyTo,
    references: input.references,
  });
}

// Prefixes a subject with "Re:" for a reply, without stacking a second one on a
// subject that already has it (case-insensitive, tolerant of leading whitespace).
export function replySubject(subject: string): string {
  const trimmed = subject.trim();
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}
