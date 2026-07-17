import { Router } from "express";
import multer from "multer";

import prisma from "../db";
import { isAiConfigured } from "../lib/ai";
import {
  sendAutoResolveTicketJob,
  sendClassifyTicketJob,
} from "../lib/queue";
import { WEBHOOK_SECRET } from "../lib/env";
import {
  inboundEmailSchema,
  ticketFromInboundEmail,
} from "../lib/inbound-email";
import { validate } from "../lib/validate";

export const webhooksRouter = Router();

// Parses multipart form fields into req.body (no file handling — SendGrid
// attachments are out of scope).
const upload = multer();

// Inbound email → ticket. This endpoint is public (mounted above requireAuth) so
// the email provider can reach it. When WEBHOOK_SECRET is set, a matching
// `?token=` is required — keep it unset in dev/E2E so local posts/tests work.
// The parse/derive logic lives in lib/inbound-email.ts and is unit-tested there.
webhooksRouter.post("/inbound-email", upload.none(), async (req, res) => {
  if (WEBHOOK_SECRET && req.query.token !== WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const data = validate(inboundEmailSchema, req.body, res);
  if (!data) return;

  // When AI is on, the ticket enters the intake pipeline as `new` — hidden from
  // agents while the auto-resolve worker tries to answer it, then moved to a
  // terminal status by that worker. With AI off there's no pipeline, so it starts
  // `open` (the column default) and is immediately visible to agents.
  const aiConfigured = isAiConfigured();

  const ticket = await prisma.ticket.create({
    data: {
      // id is an auto-incrementing integer — the DB assigns it.
      ...ticketFromInboundEmail(data),
      // category is left null until AI classification runs.
      ...(aiConfigured ? { status: "new" as const } : {}),
    },
  });

  // Enqueue the background intake jobs, but only when AI is configured — an
  // unconfigured server would otherwise queue jobs that can only fail (and would
  // strand the ticket in `new`). Enqueuing is a quick, durable DB insert that never
  // throws (see the send* helpers), so we await both before responding: the jobs are
  // committed before the email is acknowledged, and workers pick them up off the
  // request path. Auto-resolve owns the `new` → `processing` → terminal transition;
  // classification fills in the category alongside it.
  if (aiConfigured) {
    await sendClassifyTicketJob(ticket.id);
    await sendAutoResolveTicketJob(ticket.id);
  }

  // SendGrid treats any 2xx as successful delivery; a non-2xx triggers retries.
  res.status(200).json({ ticketId: ticket.id });
});
