import { z } from "zod/v4";
import type { Response } from "express";

// A positive integer id, as it arrives on the URL — always a string, hence the
// coercion. Rejects 0, negatives, fractions, and anything non-numeric. Note that
// z.coerce.number() runs Number(), which treats "" and " " as 0 — that's caught by
// positive(), but it's why the check has to be this strict rather than just int().
const idSchema = z.coerce.number().int().positive();

// Parses a numeric id route param (e.g. `/api/tickets/:id`). Returns the id, or
// null after sending a 404 — an unparseable id can't name a row, so it's "not
// found" rather than a 400: `/api/tickets/abc` and `/api/tickets/999999` are the
// same story from the client's side, and a 400 would imply the request itself was
// malformed.
//
// Mirrors `validate`'s contract (parsed value, or null once the response is sent)
// so callers early-return the same way.
export function parseId(
  param: string | undefined,
  res: Response,
  notFoundMessage = "Not found",
): number | null {
  const result = idSchema.safeParse(param);
  if (!result.success) {
    res.status(404).json({ error: notFoundMessage });
    return null;
  }
  return result.data;
}
