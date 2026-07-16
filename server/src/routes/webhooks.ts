import { Router } from "express";
import multer from "multer";

import prisma from "../db";
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

  const ticket = await prisma.ticket.create({
    data: {
      // id is an auto-incrementing integer — the DB assigns it.
      ...ticketFromInboundEmail(data),
      // status defaults to `open`; category is left null until AI classification.
    },
  });

  // SendGrid treats any 2xx as successful delivery; a non-2xx triggers retries.
  res.status(200).json({ ticketId: ticket.id });
});
