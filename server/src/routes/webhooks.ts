import { Router } from "express";
import multer from "multer";

import { WEBHOOK_SECRET } from "../lib/env";
import { inboundEmailSchema } from "../lib/inbound-email";
import { intakeEmailTicket } from "../lib/ticket-intake";
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

  // All the create + AI-pipeline logic lives in lib/ticket-intake, shared with the
  // IMAP poller so both inbound paths create a ticket identically. Returns null when
  // the message had no valid sender address and was dropped (a ticket always has a
  // sender email).
  const ticket = await intakeEmailTicket(data);

  // SendGrid treats any 2xx as successful delivery; a non-2xx triggers retries. A
  // dropped (sender-less) message is still acknowledged so it isn't redelivered.
  if (!ticket) {
    res.status(200).json({ dropped: "no valid sender address" });
    return;
  }
  res.status(200).json({ ticketId: ticket.id });
});
