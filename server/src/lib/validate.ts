import type { Response } from "express";
import type { ZodType } from "zod/v4";

// Validates a request body against a Zod schema. On success returns the parsed
// (typed) data; on failure sends a 400 with `{ error }` (the shape the client's
// ErrorAlert extracts from `error.response.data.error`) and returns null so the
// caller can early-return.
export function validate<T>(
  schema: ZodType<T>,
  body: unknown,
  res: Response,
): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    res
      .status(400)
      .json({ error: result.error.issues[0]?.message ?? "Invalid request" });
    return null;
  }
  return result.data;
}
