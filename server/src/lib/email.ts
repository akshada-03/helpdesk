import dns from "node:dns";
import nodemailer, { type Transporter } from "nodemailer";

import {
  SMTP_FROM,
  SMTP_HOST,
  SMTP_PASS,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
} from "./env";

// Ensure Node/Bun prefers IPv4 addresses globally
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

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
// per send would drop that. Resolves SMTP_HOST directly to an IPv4 IP address so
// cloud platforms (like Render) never attempt unreachable IPv6 routes.
async function getTransporter(): Promise<Transporter> {
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

  let targetHost = SMTP_HOST;
  try {
    const resolved = await dns.promises.lookup(SMTP_HOST, { family: 4 });
    if (resolved?.address) {
      targetHost = resolved.address;
    }
  } catch (err) {
    console.warn("IPv4 pre-lookup failed, using hostname:", err);
  }

  transporter = nodemailer.createTransport({
    host: targetHost,
    port,
    secure,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: {
      // Ensure TLS certificate matches the host domain even when connecting by IP
      servername: SMTP_HOST,
    },
    family: 4,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
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
  const t = await getTransporter();
  await t.sendMail({
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
