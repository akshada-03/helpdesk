import dns from "node:dns";
import nodemailer, { type Transporter } from "nodemailer";

import {
  RESEND_API_KEY,
  SENDGRID_API_KEY,
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

// Outbound email via HTTP API (Resend / SendGrid) or direct SMTP (nodemailer).
// On cloud platforms (like Render free tier) that block standard SMTP ports (25/465/587),
// setting RESEND_API_KEY or SENDGRID_API_KEY routes emails over standard HTTPS (port 443).

// Configured when we have an HTTP email API key OR valid SMTP credentials.
export function isEmailConfigured(): boolean {
  return Boolean(
    RESEND_API_KEY ||
      SENDGRID_API_KEY ||
      (SMTP_HOST && SMTP_USER && SMTP_PASS),
  );
}

// The address outgoing mail is sent from. Defaults to the login mailbox.
export function emailFrom(): string {
  return SMTP_FROM || SMTP_USER || "";
}

let transporter: Transporter | null = null;

// Built once and reused: nodemailer pools connections per transport, so recreating it
// per send would drop that. Resolves SMTP_HOST directly to an IPv4 IP address so
// cloud platforms never attempt unreachable IPv6 routes.
async function getTransporter(): Promise<Transporter> {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      "Email is not configured — set RESEND_API_KEY, or SMTP_HOST, SMTP_USER, and SMTP_PASS in server/.env",
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
// Prioritizes HTTP REST APIs (Resend / SendGrid) over port 443 when available,
// which is completely immune to cloud SMTP firewall blocks.
export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
}): Promise<void> {
  const from = emailFrom();

  // 1. Resend HTTP REST API (HTTPS port 443 — standard for Render free tier)
  if (RESEND_API_KEY) {
    const headers: Record<string, string> = {};
    if (input.inReplyTo) headers["In-Reply-To"] = input.inReplyTo;
    if (input.references) headers["References"] = input.references;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from || "onboarding@resend.dev",
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Resend API failed (${res.status}): ${errorText}`);
    }
    return;
  }

  // 2. SendGrid HTTP REST API (HTTPS port 443)
  if (SENDGRID_API_KEY) {
    const headers: Record<string, string> = {};
    if (input.inReplyTo) headers["In-Reply-To"] = input.inReplyTo;
    if (input.references) headers["References"] = input.references;

    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.to }] }],
        from: { email: from || "support@example.com" },
        subject: input.subject,
        content: [
          { type: "text/plain", value: input.text },
          ...(input.html ? [{ type: "text/html", value: input.html }] : []),
        ],
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`SendGrid API failed (${res.status}): ${errorText}`);
    }
    return;
  }

  // 3. Fallback: Direct SMTP (nodemailer)
  const t = await getTransporter();
  await t.sendMail({
    from,
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
